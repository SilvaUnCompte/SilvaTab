import { useState } from "react";
import { useLogin } from "../hooks";
import { ErrorBanner } from "./ui";

export function LoginScreen() {
  const [password, setPassword] = useState("");
  const login = useLogin();

  return (
    <div className="center full">
      <form
        className="login-card col gap-16"
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate(password);
        }}
      >
        <div className="row gap-8">
          <span className="brand-mark" />
          <span className="brand">Silva's Tab</span>
        </div>
        <label className="field">
          <span className="text-secondary">Instance password</span>
          <input className="input" type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <ErrorBanner error={login.error} />
        <button className="btn btn-primary" disabled={!password || login.isPending}>
          Sign in
        </button>
      </form>
    </div>
  );
}
