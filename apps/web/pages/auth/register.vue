<script setup lang="ts">
import { useAuthStore } from "~/stores/auth";

useSeoMeta({ title: "Create an account" });

const auth = useAuthStore();
const name = ref("");
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
  return "We couldn't create your account. Please try again.";
}

async function submit(): Promise<void> {
  errorMessage.value = "";
  submitting.value = true;
  try {
    await auth.register(email.value, password.value, name.value);
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
      <p class="text-sm font-semibold text-moss">A lovely place to begin</p>
      <h1 class="mt-2 text-3xl font-semibold tracking-tight">Create your account</h1>
      <p class="mt-2 text-sm leading-6 text-ink/60">Start with a free event and invite your people in minutes.</p>
      <form class="mt-7 space-y-5" @submit.prevent="submit">
        <div>
          <label for="name" class="mb-2 block text-sm font-medium">Your name</label>
          <input id="name" v-model="name" type="text" autocomplete="name" required maxlength="160" class="min-h-12 w-full rounded-xl border border-line bg-paper/50 px-4 outline-none focus:border-moss">
        </div>
        <div>
          <label for="email" class="mb-2 block text-sm font-medium">Email address</label>
          <input id="email" v-model="email" type="email" autocomplete="email" required maxlength="320" class="min-h-12 w-full rounded-xl border border-line bg-paper/50 px-4 outline-none focus:border-moss">
        </div>
        <div>
          <label for="password" class="mb-2 block text-sm font-medium">Password</label>
          <input id="password" v-model="password" type="password" autocomplete="new-password" required minlength="12" maxlength="128" class="min-h-12 w-full rounded-xl border border-line bg-paper/50 px-4 outline-none focus:border-moss">
          <p class="mt-2 text-xs text-ink/50">Use at least 12 characters.</p>
        </div>
        <p v-if="errorMessage" class="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{{ errorMessage }}</p>
        <button type="submit" class="min-h-12 w-full rounded-xl bg-moss px-5 font-semibold text-white hover:bg-moss-dark disabled:cursor-not-allowed disabled:opacity-60" :disabled="submitting">
          {{ submitting ? "Creating account…" : "Create account" }}
        </button>
      </form>
      <p class="mt-6 text-center text-sm text-ink/60">
        Already have an account?
        <NuxtLink to="/auth/login" class="font-semibold text-moss underline-offset-4 hover:underline">Sign in</NuxtLink>
      </p>
    </div>
  </section>
</template>
