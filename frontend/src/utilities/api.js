import { getAccessToken } from "./auth";

// use this instead of fetch(...) 
export async function authFetch(input, init = {}) {
  let token = localStorage.getItem("accessToken");
  if (!token) {
    // if you don’t have one (e.g. page just loaded), pull from Cognito
    token = await getAccessToken();
    // amazonq-ignore-next-line
    localStorage.setItem("accessToken", token);
  }

  const headers = {
    ...(init.headers || {}),
    Authorization: `Bearer ${token}`,
    "Content-Type":  "application/json",
  };

  return fetch(input, { ...init, headers });
}
