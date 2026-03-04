from __future__ import annotations

import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

import click


def repo_root() -> Path:
    return Path(__file__).resolve().parent


def runtime_file() -> Path:
    return repo_root() / ".taskmanagement" / "runtime.json"


def read_runtime() -> dict[str, Any] | None:
    file_path = runtime_file()
    if not file_path.exists():
        return None
    try:
        return json.loads(file_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def write_runtime(payload: dict[str, Any]) -> None:
    file_path = runtime_file()
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def clear_runtime() -> None:
    file_path = runtime_file()
    if file_path.exists():
        file_path.unlink()


def is_pid_running(pid: int | None) -> bool:
    if not pid or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def terminate_pid(pid: int, timeout_seconds: float = 8.0) -> None:
    if not is_pid_running(pid):
        return

    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        return

    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if not is_pid_running(pid):
            return
        time.sleep(0.2)

    try:
        os.kill(pid, signal.SIGKILL)
    except ProcessLookupError:
        return


def port_is_listening(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.4)
        return sock.connect_ex((host, port)) == 0


def listening_pids(port: int) -> set[int]:
    command = ["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-t"]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode not in (0, 1):
        return set()

    pids: set[int] = set()
    for line in result.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            pids.add(int(line))
        except ValueError:
            continue
    return pids


def stop_listeners(ports: list[int], timeout_seconds: float = 8.0) -> int:
    terminated = 0
    for port in ports:
        for pid in listening_pids(port):
            if pid == os.getpid():
                continue
            if is_pid_running(pid):
                terminate_pid(pid, timeout_seconds=timeout_seconds)
                terminated += 1
    return terminated


def active_runtime() -> dict[str, Any] | None:
    payload = read_runtime()
    if not payload:
        return None

    launcher_pid = payload.get("launcher_pid")
    backend_pid = payload.get("backend_pid")
    frontend_pid = payload.get("frontend_pid")

    if any(is_pid_running(pid) for pid in (launcher_pid, backend_pid, frontend_pid)):
        return payload

    clear_runtime()
    return None


def stop_runtime(timeout_seconds: float = 8.0, include_launcher: bool = True) -> bool:
    payload = active_runtime()
    if not payload:
        return False

    frontend_pid = payload.get("frontend_pid")
    backend_pid = payload.get("backend_pid")
    launcher_pid = payload.get("launcher_pid")

    if isinstance(frontend_pid, int):
        terminate_pid(frontend_pid, timeout_seconds=timeout_seconds)
    if isinstance(backend_pid, int):
        terminate_pid(backend_pid, timeout_seconds=timeout_seconds)
    if include_launcher and isinstance(launcher_pid, int):
        terminate_pid(launcher_pid, timeout_seconds=timeout_seconds)

    clear_runtime()
    return True


def _ensure_tool(name: str) -> None:
    if shutil.which(name) is None:
        raise RuntimeError(f"Missing required command: {name}")


def _run_checked(command: list[str], cwd: Path) -> None:
    result = subprocess.run(command, cwd=str(cwd), check=False)
    if result.returncode != 0:
        raise RuntimeError(f"Command failed ({result.returncode}): {' '.join(command)}")


def _start_process(command: list[str], cwd: Path) -> subprocess.Popen:
    return subprocess.Popen(command, cwd=str(cwd))


def start_servers(backend_port: int, frontend_port: int, skip_frontend_install: bool) -> int:
    root = repo_root()
    frontend_dir = root / "frontend"

    if active_runtime():
        click.echo("[start] Existing launcher runtime found. Run 'taskbeard stop' first.", err=True)
        return 1

    blocked_ports: list[int] = []
    if port_is_listening(backend_port):
        blocked_ports.append(backend_port)
    if port_is_listening(frontend_port):
        blocked_ports.append(frontend_port)
    if blocked_ports:
        click.echo(
            "[start] Port(s) already in use: %s. Run 'taskbeard stop --backend-port %d --frontend-port %d' or free the ports manually."
            % (", ".join(str(port) for port in blocked_ports), backend_port, frontend_port),
            err=True,
        )
        return 1

    try:
        _ensure_tool("npm")
    except RuntimeError as error:
        click.echo(str(error), err=True)
        return 1

    if not skip_frontend_install and not (frontend_dir / "node_modules").exists():
        click.echo("[start] Installing frontend dependencies (npm install)...")
        try:
            _run_checked(["npm", "install"], frontend_dir)
        except RuntimeError as error:
            click.echo(str(error), err=True)
            return 1

    backend_cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "backend.app.main:app",
        "--reload",
        "--host",
        "127.0.0.1",
        "--port",
        str(backend_port),
    ]
    frontend_cmd = [
        "npm",
        "run",
        "dev",
        "--",
        "--host",
        "127.0.0.1",
        "--port",
        str(frontend_port),
    ]

    click.echo(f"[start] Backend: http://127.0.0.1:{backend_port}")
    click.echo(f"[start] Frontend: http://127.0.0.1:{frontend_port}")

    backend = _start_process(backend_cmd, root)
    frontend = _start_process(frontend_cmd, frontend_dir)

    write_runtime(
        {
            "launcher_pid": os.getpid(),
            "backend_pid": backend.pid,
            "frontend_pid": frontend.pid,
            "backend_port": backend_port,
            "frontend_port": frontend_port,
        }
    )

    def shutdown(*_: object) -> None:
        for process in (frontend, backend):
            if process.poll() is None:
                process.terminate()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    try:
        while True:
            backend_code = backend.poll()
            frontend_code = frontend.poll()
            if backend_code is not None:
                shutdown()
                return backend_code
            if frontend_code is not None:
                shutdown()
                return frontend_code
            time.sleep(0.5)
    except KeyboardInterrupt:
        shutdown()
        return 0
    finally:
        clear_runtime()


def stop_servers(timeout: float, backend_port: int, frontend_port: int, extra_port: tuple[int, ...]) -> int:
    runtime = active_runtime()
    ports = [backend_port, frontend_port, *list(extra_port)]
    if runtime:
        runtime_backend_port = runtime.get("backend_port")
        runtime_frontend_port = runtime.get("frontend_port")
        if isinstance(runtime_backend_port, int):
            ports.append(runtime_backend_port)
        if isinstance(runtime_frontend_port, int):
            ports.append(runtime_frontend_port)

    stopped = stop_runtime(timeout_seconds=timeout, include_launcher=True)
    cleared = stop_listeners(sorted(set(ports)), timeout_seconds=timeout)

    if stopped or cleared > 0:
        click.echo("[stop] Stopped launcher, backend, and frontend processes")
    else:
        click.echo("[stop] Nothing is running")
    return 0


@click.group()
def cli() -> None:
    """Taskbeard – Simple project-management for FRC teams."""


@cli.command()
@click.option("--backend-port", type=int, default=8000, show_default=True, envvar="TASKBEARD_BACKEND_PORT")
@click.option("--frontend-port", type=int, default=5173, show_default=True, envvar="TASKBEARD_FRONTEND_PORT")
@click.option("--skip-frontend-install", is_flag=True)
def start(backend_port: int, frontend_port: int, skip_frontend_install: bool) -> None:
    raise SystemExit(start_servers(backend_port, frontend_port, skip_frontend_install))


@cli.command()
@click.option("--timeout", type=float, default=8.0, show_default=True, help="Seconds to wait before force kill")
@click.option("--backend-port", type=int, default=8000, show_default=True, envvar="TASKBEARD_BACKEND_PORT")
@click.option("--frontend-port", type=int, default=5173, show_default=True, envvar="TASKBEARD_FRONTEND_PORT")
@click.option("--extra-port", type=int, multiple=True, help="Additional port(s) to clear listeners from")
def stop(timeout: float, backend_port: int, frontend_port: int, extra_port: tuple[int, ...]) -> None:
    raise SystemExit(stop_servers(timeout, backend_port, frontend_port, extra_port))


@cli.command()
@click.option("--backend-port", type=int, default=8000, show_default=True, envvar="TASKBEARD_BACKEND_PORT")
@click.option("--frontend-port", type=int, default=5173, show_default=True, envvar="TASKBEARD_FRONTEND_PORT")
@click.option("--skip-frontend-install", is_flag=True)
def restart(backend_port: int, frontend_port: int, skip_frontend_install: bool) -> None:
    stop_servers(timeout=8.0, backend_port=backend_port, frontend_port=frontend_port, extra_port=())
    raise SystemExit(start_servers(backend_port, frontend_port, skip_frontend_install))


if __name__ == "__main__":
    cli()
