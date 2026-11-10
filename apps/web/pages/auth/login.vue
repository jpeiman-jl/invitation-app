<script setup lang="ts">
import { useAuthStore } from "~/stores/auth";

definePageMeta({ layout: "default" });
useSeoMeta({ title: "Sign in" });

const auth = useAuthStore();
const config = useRuntimeConfig();
const email = ref("");
const password = ref("");
const errorMessage = ref("");
const submitting = ref(false);

function messageFromError(error: unknown): string {
  if (typeof error === "object" && error !== null && "data" in error &&
      typeof error.data === "object" && error.data !== null && "error" in error.data &&
      typeof error.data.error === "string") {
    return error.data.error;
  }
  return "We couldn't sign you in. Please try again.";
}

async function submit(): Promise<void> {
  errorMessage.value = "";
  submitting.value = true;
  try {
    await auth.login(email.value, password.value);
    await navigateTo("/dashboard");
  } catch (error) {
    errorMessage.value = messageFromError(error);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section class="mx-auto grid min-h-[70vh] max-w-5xl items-center px-5 py-12 sm:px-8">
    <div class="mx-auto w-full max-w-md rounded-3xl border border-line bg-white p-7 shadow-soft sm:p-9">
      <p class="text-sm font-semibold text-moss">Welcome back</p>
      <h1 class="mt-2 text-3xl font-semibold tracking-tight">Sign in to InviteHub</h1>
      <p class="mt-2 text-sm leading-6 text-ink/60">Pick up where you left off and see how your guests are doing.</p>

      <form class="mt-7 space-y-5" @submit.prevent="submit">
        <div>
          <label for="email" class="mb-2 block text-sm font-medium">Email address</label>
          <input
            id="email"
            v-model="email"
            type="email"
            autocomplete="email"
            required
            maxlength="320"
            class="min-h-12 w-full rounded-xl border border-line bg-paper/50 px-4 outline-none focus:border-moss"
          >
        </div>
        <div>
          <label for="password" class="mb-2 block text-sm font-medium">Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            maxlength="128"
            class="min-h-12 w-full rounded-xl border border-line bg-paper/50 px-4 outline-none focus:border-moss"
          >
        </div>
        <p v-if="errorMessage" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {{ errorMessage }}
        </p>
        <button
          type="submit"
          class="min-h-12 w-full rounded-xl bg-moss px-5 font-semibold text-white hover:bg-moss-dark disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="submitting"
        >
          {{ submitting ? "Signing in…" : "Sign in" }}
        </button>
      </form>

      <div class="my-6 flex items-center gap-3 text-xs text-ink/45">
        <span class="h-px flex-1 bg-line" />
        OR
        <span class="h-px flex-1 bg-line" />
      </div>
      <a
        :href="`${config.public.apiBase}/api/v1/auth/google`"
        class="flex min-h-12 items-center justify-center rounded-xl border border-line px-4 text-sm font-medium hover:bg-paper"
      >
        Continue with Google
      </a>
      <p class="mt-6 text-center text-sm text-ink/60">
        New to InviteHub?
        <NuxtLink to="/auth/register" class="font-semibold text-moss underline-offset-4 hover:underline">Create an account</NuxtLink>
      </p>
    </div>
  </section>
</template>
