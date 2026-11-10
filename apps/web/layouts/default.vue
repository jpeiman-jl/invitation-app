<script setup lang="ts">
import { useAuthStore } from "~/stores/auth";

const auth = useAuthStore();
const route = useRoute();
const isInvitation = computed(() => route.path.startsWith("/i/"));
const loggingOut = ref(false);

async function logout(): Promise<void> {
  loggingOut.value = true;
  try {
    await auth.logout();
    await navigateTo("/auth/login");
  } finally {
    loggingOut.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen bg-paper text-ink">
    <header v-if="!isInvitation" class="border-b border-line bg-paper/95">
      <div class="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
        <NuxtLink to="/" class="flex items-center gap-2 font-semibold tracking-tight" aria-label="InviteHub home">
          <span class="grid h-9 w-9 place-items-center rounded-xl bg-moss text-sm text-white">IH</span>
          <span>InviteHub</span>
        </NuxtLink>
        <nav class="flex items-center gap-3 text-sm" aria-label="Main navigation">
          <NuxtLink to="/dashboard" class="hidden rounded-full px-3 py-2 text-ink/75 hover:bg-white sm:inline-flex">
            Dashboard
          </NuxtLink>
          <template v-if="auth.user">
            <span class="hidden max-w-40 truncate text-ink/60 sm:inline">{{ auth.user.name }}</span>
            <button
              type="button"
              class="rounded-full border border-line px-4 py-2 hover:bg-white disabled:opacity-60"
              :disabled="loggingOut"
              @click="logout"
            >
              {{ loggingOut ? "Signing out…" : "Sign out" }}
            </button>
          </template>
          <template v-else>
            <NuxtLink to="/auth/login" class="rounded-full border border-line px-4 py-2 hover:bg-white">
              Sign in
            </NuxtLink>
            <NuxtLink to="/auth/register" class="rounded-full bg-moss px-4 py-2 font-medium text-white hover:bg-moss-dark">
              Get started
            </NuxtLink>
          </template>
        </nav>
      </div>
    </header>
    <main>
      <slot />
    </main>
    <footer v-if="!isInvitation" class="mx-auto mt-16 max-w-7xl border-t border-line px-5 py-8 text-sm text-ink/55 sm:px-8">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span>InviteHub · Make room for a good day.</span>
        <span>Thoughtful invitations, easier gatherings.</span>
      </div>
    </footer>
  </div>
</template>
