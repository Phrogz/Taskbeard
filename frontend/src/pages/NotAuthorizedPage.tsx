import { logout } from "../services/authApi";

type Props = {
  email: string;
  onLogout: () => void;
};

export function NotAuthorizedPage({ email, onLogout }: Props) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Not Authorized</h1>
        <p>
          The account <strong>{email}</strong> does not have access to this
          application.
        </p>
        <p className="muted">
          Contact an administrator if you believe this is an error.
        </p>
        <button
          className="auth-signout-btn"
          onClick={async () => {
            await logout();
            onLogout();
          }}
        >
          Sign in with a different account
        </button>
      </div>
    </div>
  );
}
