import { $fetch } from "ofetch";

function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }
  const entry = cookieHeader.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : undefined;
}

function forwardableCookies(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }
  const cookies = cookieHeader.split(";").map((part) => part.trim())
    .filter((part) => part.startsWith("invitehub_session=") || part.startsWith("invitehub_csrf="));
  return cookies.length > 0 ? cookies.join("; ") : undefined;
}

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();
  const csrfCookie = useCookie<string | null>("invitehub_csrf");
  const requestCookie = import.meta.server ? useRequestHeaders(["cookie"]).cookie : undefined;
  const apiCookies = import.meta.server ? forwardableCookies(requestCookie) : undefined;
  let csrfToken: string | undefined;

  const api = $fetch.create({
    baseURL: config.public.apiBase,
    credentials: "include",
    onRequest({ options }) {
      const headers = new Headers(options.headers);
      if (apiCookies) {
        headers.set("cookie", apiCookies);
      }
      const method = String(options.method ?? "GET").toUpperCase();
      if (["GET", "HEAD", "OPTIONS"].includes(method)) {
        if (apiCookies) {
          options.headers = headers;
        }
        return;
      }
      const token = csrfToken
        ?? csrfCookie.value
        ?? readCookie(requestCookie, "invitehub_csrf");
      if (token) {
        headers.set("x-csrf-token", token);
      }
      options.headers = headers;
    },
    onResponse({ response }) {
      csrfToken = response.headers.get("x-csrf-token") ?? csrfToken;
    }
  });

  return { provide: { api } };
});
