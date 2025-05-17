import { CognitoUser, AuthenticationDetails } from "amazon-cognito-identity-js";
import UserPool from "./cognitoConfig";

// call this from your login form
export function login(username, password) {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: username, Pool: UserPool });
    const authDetails = new AuthenticationDetails({ Username: username, Password: password });

    user.authenticateUser(authDetails, {
      onSuccess: (session) => {
        const accessToken  = session.getAccessToken().getJwtToken();
        const idToken      = session.getIdToken().getJwtToken();
        const refreshToken = session.getRefreshToken().getToken();
        resolve({ accessToken, idToken, refreshToken });
      },
      onFailure: (err) => reject(err),
    });
  });
}

// to grab a valid session (e.g. when your page reloads)
export function getSession() {
  return new Promise((resolve, reject) => {
    const user = UserPool.getCurrentUser();
    if (!user) return reject(new Error("No user logged in"));

    user.getSession((err, session) => {
      if (err || !session.isValid()) return reject(err || new Error("Session invalid"));
      resolve(session);
    });
  });
}

// handy for your fetch wrapper
export async function getAccessToken() {
  const session = await getSession();
  return session.getAccessToken().getJwtToken();
}

export function logout() {
  const user = UserPool.getCurrentUser();
  if (user) user.signOut();
  localStorage.removeItem("accessToken");
  localStorage.removeItem("idToken");
}

export async function getIdToken() {
  const session = await getSession();
  return session.getIdToken().getJwtToken();
}
