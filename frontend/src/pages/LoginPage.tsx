import { GoogleLogin } from "@react-oauth/google";
import { login, type AuthUser } from "../services/authApi";

type Props = {
  onLogin: (user: AuthUser) => void;
  onUnauthorized: (email: string) => void;
};

export function LoginPage({ onLogin, onUnauthorized }: Props) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Taskbeard</h1>
        <p className="muted">Sign in to access the planning board.</p>
        <div className="auth-google-btn">
          <GoogleLogin
            onSuccess={async (response) => {
              if (!response.credential) return;
              try {
                const user = await login(response.credential);
                onLogin(user);
              } catch (err) {
                const message = err instanceof Error ? err.message : "";
                const emailMatch = message.match(/Account (.+?) is not authorized/);
                onUnauthorized(emailMatch?.[1] ?? "unknown");
              }
            }}
            onError={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
