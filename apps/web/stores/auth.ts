import { defineStore } from "pinia";

export interface HostUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

function getStatusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  if ("statusCode" in error && typeof error.statusCode === "number") {
    return error.statusCode;
  }
  if ("response" in error && typeof error.response === "object" && error.response !== null &&
      "status" in error.response && typeof error.response.status === "number") {
    return error.response.status;
  }
  return undefined;
}

export const useAuthStore = defineStore("auth", () => {
  const user = ref<HostUser | null>(null);
  const loaded = ref(false);
  const { $api } = useNuxtApp();

  async function ensureCsrf(): Promise<void> {
    await $api<{ status: string }>("/health");
  }

  async function load(): Promise<void> {
    await ensureCsrf();
    try {
      const result = await $api<{ user: HostUser }>("/api/v1/auth/me");
      user.value = result.user;
    } catch (error) {
      if (getStatusCode(error) !== 401) {
        throw error;
      }
      user.value = null;
    } finally {
      loaded.value = true;
    }
  }

  async function login(email: string, password: string): Promise<void> {
    await ensureCsrf();
    const result = await $api<{ user: HostUser }>("/api/v1/auth/login", {
      method: "POST",
      body: { email, password }
    });
    user.value = result.user;
    loaded.value = true;
  }

  async function register(email: string, password: string, name: string): Promise<void> {
    await ensureCsrf();
    const result = await $api<{ user: HostUser }>("/api/v1/auth/register", {
      method: "POST",
      body: { email, password, name }
    });
    user.value = result.user;
    loaded.value = true;
  }

  async function logout(): Promise<void> {
    await ensureCsrf();
    await $api("/api/v1/auth/logout", { method: "POST" });
    user.value = null;
    loaded.value = true;
  }

  return { user, loaded, ensureCsrf, load, login, register, logout };
});
