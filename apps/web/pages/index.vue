<script setup lang="ts">
useSeoMeta({
  title: "Gather beautifully",
  description: "Create thoughtful invitations, collect RSVPs, and bring everyone together."
});
</script>

<template>
  <section class="mx-auto grid max-w-7xl gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
    <div>
      <p class="mb-5 inline-flex items-center gap-2 rounded-full border border-moss/20 bg-white px-4 py-2 text-sm font-medium text-moss">
        <span aria-hidden="true" class="h-2 w-2 rounded-full bg-moss" />
        A little more joy in getting together
      </p>
      <h1 class="max-w-3xl text-5xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
        Bring your people together, <span class="font-serif font-normal italic text-moss">beautifully.</span>
      </h1>
      <p class="mt-6 max-w-xl text-lg leading-8 text-ink/65">
        Create an invitation that feels like your event, share it in a tap, and keep every RSVP in one calm place.
      </p>
      <div class="mt-8 flex flex-col gap-3 sm:flex-row">
        <NuxtLink to="/auth/register" class="inline-flex min-h-12 items-center justify-center rounded-full bg-moss px-6 font-semibold text-white shadow-sm hover:bg-moss-dark">
          Create your first event
        </NuxtLink>
        <NuxtLink to="/auth/login" class="inline-flex min-h-12 items-center justify-center rounded-full border border-line bg-white px-6 font-semibold hover:bg-white/70">
          I already have an account
        </NuxtLink>
      </div>
      <p class="mt-4 text-sm text-ink/55">Start free · Guests never need an account</p>
    </div>
    <div class="relative mx-auto w-full max-w-lg">
      <div class="absolute -left-6 top-8 h-40 w-40 rounded-full bg-[#dfe8df] blur-2xl" aria-hidden="true" />
      <div class="absolute -right-4 bottom-3 h-44 w-44 rounded-full bg-[#f0dfc8] blur-2xl" aria-hidden="true" />
      <article class="relative rotate-1 rounded-[2rem] border border-white bg-[#fffdf9] p-8 shadow-soft sm:p-11">
        <div class="mx-auto mb-7 h-1 w-16 rounded-full bg-[#94766a]/40" />
        <p class="text-center text-xs uppercase tracking-[0.3em] text-[#80685d]">Together with their families</p>
        <h2 class="mt-5 text-center font-serif text-4xl leading-tight text-[#3d302a] sm:text-5xl">A day to remember</h2>
        <p class="mt-4 text-center text-sm text-[#766960]">Saturday · September 12 · 4:30 PM</p>
        <div class="my-8 border-t border-[#e9e1d7]" />
        <div class="rounded-2xl bg-[#f7f2e9] p-5 text-center">
          <p class="text-sm font-medium text-[#51443c]">Your celebration, your way.</p>
          <p class="mt-2 text-xs leading-5 text-[#766960]">A lovely invite. One simple RSVP. More time for the good stuff.</p>
        </div>
        <div class="mt-7 flex justify-center">
          <span class="rounded-full bg-[#8a6558] px-5 py-2 text-sm font-medium text-white">Respond with joy</span>
        </div>
      </article>
    </div>
  </section>

  <section class="border-y border-line bg-white/70">
    <div class="mx-auto grid max-w-7xl gap-7 px-5 py-10 sm:px-8 md:grid-cols-3">
      <div>
        <p class="text-sm font-semibold text-moss">01 · Make it yours</p>
        <h2 class="mt-2 text-xl font-semibold">A warm welcome</h2>
        <p class="mt-2 text-sm leading-6 text-ink/60">Choose a ready-to-go design and share a link guests can open anywhere.</p>
      </div>
      <div>
        <p class="text-sm font-semibold text-moss">02 · Keep it simple</p>
        <h2 class="mt-2 text-xl font-semibold">One clear RSVP</h2>
        <p class="mt-2 text-sm leading-6 text-ink/60">Know who's coming, how many seats they need, and any dietary notes.</p>
      </div>
      <div>
        <p class="text-sm font-semibold text-moss">03 · Enjoy the day</p>
        <h2 class="mt-2 text-xl font-semibold">Everyone in one place</h2>
        <p class="mt-2 text-sm leading-6 text-ink/60">A tidy guest list helps you spend less time chasing replies.</p>
      </div>
    </div>
  </section>
</template>
