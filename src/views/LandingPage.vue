<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import Drawer from 'primevue/drawer'
import Button from 'primevue/button'

const visible = ref(false)

const features = [
  {
    icon: 'fa-solid fa-route',
    title: 'Door-to-Door Convenience',
    description:
      'Request a ride in seconds and get picked up by top-rated drivers wherever you are in the city.',
  },
  {
    icon: 'fa-solid fa-stopwatch',
    title: 'Arrive On Time',
    description:
      'Smart dispatching, live GPS tracking, and traffic-aware routing get you to your destination faster.',
  },
  {
    icon: 'fa-solid fa-shield-heart',
    title: 'Trusted & Secure',
    description:
      'Every trip is backed by 24/7 support, driver background checks, and shareable trip details.',
  },
]

const steps = [
  {
    number: '01',
    title: 'Set Your Pickup',
    description: 'Enter your pickup point or let the app detect your location automatically.',
  },
  {
    number: '02',
    title: 'Choose Your Ride',
    description: 'Select the vehicle type that fits your style and budget before you confirm.',
  },
  {
    number: '03',
    title: 'Track & Relax',
    description:
      'Follow your driver in real time, pay in-app, and rate the experience when you arrive.',
  },
]

const testimonials = [
  {
    quote:
      '“The most reliable rideshare service I have used in Medellín. Drivers are friendly and the cars are spotless.”',
    name: 'Laura G.',
    role: 'Frequent Rider',
  },
  {
    quote:
      '“I joined as a driver last year and the support team has been excellent. Earnings are transparent and weekly.”',
    name: 'Carlos R.',
    role: 'Driver Partner',
  },
]

const stats = [
  { label: 'Cities Served', value: '25+' },
  { label: 'Completed Trips', value: '4M+' },
  { label: 'Average Rating', value: '4.9' },
]

const isMobileMenuOpen = ref(false)

const toggleMobileMenu = () => {
  isMobileMenuOpen.value = !isMobileMenuOpen.value
}
</script>

<template>
  <div class="bg-gray-900 text-gray-100 min-h-screen">
    <!-- Navigation -->
    <header class="border-b border-gray-800">
      <nav class="container mx-auto px-6 py-6 flex items-center justify-between">
        <RouterLink to="/" class="text-2xl font-bold tracking-tight text-white">
          <i class="fa-solid fa-car-side text-emerald-400 mr-2"></i>{{ $t('app.name') }}
        </RouterLink>
        <div class="hidden md:flex items-center space-x-8 text-sm font-semibold">
          <a class="hover:text-white transition-colors" href="#rider">Ride</a>
          <a class="hover:text-white transition-colors" href="#driver">Drive</a>
          <a class="hover:text-white transition-colors" href="#features">Features</a>
          <a class="hover:text-white transition-colors" href="#support">Support</a>
        </div>
        <div class="hidden md:flex items-center space-x-4">
          <RouterLink
            class="px-4 py-2 rounded-lg border border-gray-700 hover:border-gray-500 transition"
            to="/login"
          >
            {{ $t('login') }}
          </RouterLink>
          <RouterLink
            class="px-4 py-2 rounded-lg bg-emerald-500 text-gray-900 font-semibold hover:bg-emerald-400 transition"
            to="/signup"
          >
            {{ $t('signup') }}
          </RouterLink>
        </div>
        <div class="block md:hidden">
          <Button
            @click="toggleMobileMenu"
            class="text-2xl text-gray-300 focus:outline-none"
            aria-label="Toggle menu"
            :aria-expanded="isMobileMenuOpen"
            :icon="isMobileMenuOpen ? 'pi pi-times' : 'pi pi-bars'"
          />
        </div>
      </nav>
      <transition
        enter-active-class="transition ease-out duration-300"
        enter-from-class="opacity-0 -translate-y-4"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition ease-in duration-200"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-4"
      >
        <div
          v-if="isMobileMenuOpen"
          class="fixed inset-0 top-[72px] md:hidden bg-gray-950 border-t border-gray-800 z-50"
        >
          <div class="px-6 py-4 space-y-4 text-sm font-semibold">
            <a
              href="#rider"
              @click="toggleMobileMenu"
              class="block text-gray-300 hover:text-white transition-colors"
              >Ride</a
            >
            <a
              href="#driver"
              @click="toggleMobileMenu"
              class="block text-gray-300 hover:text-white transition-colors"
              >Drive</a
            >
            <a
              href="#features"
              @click="toggleMobileMenu"
              class="block text-gray-300 hover:text-white transition-colors"
              >Features</a
            >
            <a
              href="#support"
              @click="toggleMobileMenu"
              class="block text-gray-300 hover:text-white transition-colors"
              >Support</a
            >
            <RouterLink
              to="/login"
              @click="toggleMobileMenu"
              class="block border border-gray-800 rounded-lg px-4 py-3 text-center text-gray-300 hover:text-white hover:border-gray-600 transition-colors"
            >
              {{ $t('login') }}
            </RouterLink>
            <RouterLink
              to="/signup"
              @click="toggleMobileMenu"
              class="block rounded-lg px-4 py-3 text-center bg-emerald-500 text-gray-900 font-semibold hover:bg-emerald-400 transition-colors"
            >
              {{ $t('signup') }}
            </RouterLink>
          </div>
        </div>
      </transition>
    </header>

    <main>
      <!-- Hero -->
      <section id="rider" class="relative overflow-hidden">
        <div
          class="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-900 to-black opacity-90"
        ></div>
        <div class="container mx-auto px-6 py-24 relative z-10">
          <div class="flex flex-col lg:flex-row items-center">
            <div class="lg:w-1/2 space-y-6">
              <span class="uppercase text-emerald-400 tracking-[0.3em] text-xs"
                >On-demand mobility</span
              >
              <h1 class="text-4xl md:text-6xl font-black leading-tight">
                Move like Medellín moves
              </h1>
              <p class="text-gray-300 text-lg md:text-xl max-w-xl">
                Tap a button, get a ride. Seamless pickups, transparent fares, and real-time
                tracking keep you in control from curb to destination.
              </p>
              <div class="flex flex-col sm:flex-row gap-4 sm:items-center">
                <RouterLink
                  to="/signup"
                  class="bg-emerald-500 text-gray-900 font-semibold text-sm uppercase tracking-wide px-8 py-3 rounded-lg hover:bg-emerald-400 transition"
                >
                  Get Started
                </RouterLink>
                <a
                  href="#driver"
                  class="text-sm uppercase tracking-wide px-8 py-3 rounded-lg border border-gray-700 hover:border-gray-500 transition"
                >
                  Become a driver
                </a>
              </div>
              <div class="grid grid-cols-3 gap-6 pt-8">
                <div v-for="metric in stats" :key="metric.label">
                  <div class="text-3xl font-bold text-white">{{ metric.value }}</div>
                  <div class="text-gray-400 text-xs uppercase tracking-wide">
                    {{ metric.label }}
                  </div>
                </div>
              </div>
            </div>
            <div class="lg:w-1/2 mt-16 lg:mt-0 flex justify-center">
              <div class="relative w-full max-w-sm">
                <div
                  class="absolute -top-6 -left-6 w-40 h-40 bg-emerald-500/20 rounded-full blur-3xl"
                ></div>
                <img
                  alt="Rider using the app"
                  class="rounded-3xl border border-gray-800 shadow-[0_30px_80px_-40px_rgba(16,185,129,0.7)]"
                  src="https://images.unsplash.com/photo-1617813489478-77657097c5d0?auto=format&fit=crop&w=450&q=80"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Key Features -->
      <section id="features" class="py-24 bg-gray-950">
        <div class="container mx-auto px-6">
          <div class="flex flex-col md:flex-row md:items-end md:justify-between mb-16">
            <div>
              <h2 class="text-3xl md:text-4xl font-bold">Built for the way you move</h2>
              <p class="text-gray-400 mt-4 max-w-xl">
                From quick airport runs to late-night rides home, our platform adapts to every trip
                with premium safety and comfort features.
              </p>
            </div>
            <RouterLink
              to="/about"
              class="text-emerald-400 hover:text-emerald-300 font-semibold mt-8 md:mt-0"
            >
              Learn more about us →
            </RouterLink>
          </div>
          <div class="grid gap-10 md:grid-cols-3">
            <article
              v-for="feature in features"
              :key="feature.title"
              class="p-8 bg-gradient-to-br from-gray-900/80 to-gray-900/40 border border-gray-800 rounded-3xl backdrop-blur"
            >
              <div
                class="w-12 h-12 flex items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 text-xl mb-6"
              >
                <i :class="feature.icon"></i>
              </div>
              <h3 class="text-xl font-semibold text-white mb-3">{{ feature.title }}</h3>
              <p class="text-gray-400">{{ feature.description }}</p>
            </article>
          </div>
        </div>
      </section>

      <!-- How it works -->
      <section id="how-it-works" class="py-24 bg-gray-900">
        <div class="container mx-auto px-6">
          <div class="mb-16 max-w-2xl">
            <span class="uppercase text-emerald-400 tracking-[0.3em] text-xs">Simple process</span>
            <h2 class="text-3xl md:text-4xl font-bold mt-4">3 steps and you’re on the move</h2>
            <p class="text-gray-400 mt-4">
              Swift onboarding for riders and drivers. Manage trips, payments, and preferences
              directly in the app without leaving the flow.
            </p>
          </div>
          <div class="grid gap-10 md:grid-cols-3">
            <div
              v-for="step in steps"
              :key="step.title"
              class="p-8 rounded-3xl border border-gray-800 bg-gray-900/60"
            >
              <div class="text-emerald-500 text-sm font-semibold uppercase tracking-[0.3em]">
                {{ step.number }}
              </div>
              <h3 class="text-xl font-semibold text-white mt-6">{{ step.title }}</h3>
              <p class="text-gray-400 mt-4">{{ step.description }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Driver CTA -->
      <section
        id="driver"
        class="py-24 bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500 text-gray-900"
      >
        <div class="container mx-auto px-6 flex flex-col lg:flex-row items-center gap-16">
          <div class="lg:w-1/2 space-y-6">
            <span class="uppercase tracking-[0.3em] text-xs">Drive with {{ $t('app.name') }}</span>
            <h2 class="text-3xl md:text-5xl font-black leading-tight">Earn on your schedule</h2>
            <p class="text-gray-800 text-lg">
              Flexible hours, weekly payouts, and dedicated driver support mean every shift fits
              your lifestyle.
            </p>
            <div class="flex flex-col sm:flex-row gap-4">
              <RouterLink
                to="/driver-signup"
                class="px-8 py-3 bg-gray-900 text-white rounded-lg font-semibold uppercase tracking-wide text-sm hover:bg-black transition"
              >
                Start driving
              </RouterLink>
              <RouterLink
                to="/faq"
                class="px-8 py-3 border border-gray-900 text-gray-900 rounded-lg font-semibold uppercase tracking-wide text-sm hover:bg-gray-900 hover:text-white transition"
              >
                Driver FAQ
              </RouterLink>
            </div>
          </div>
          <div class="lg:w-1/2">
            <img
              alt="Driver smiling in car"
              class="rounded-3xl shadow-[0_40px_100px_-40px_rgba(17,94,89,0.8)]"
              src="https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=700&q=80"
            />
          </div>
        </div>
      </section>

      <!-- Testimonials -->
      <section class="py-24 bg-gray-900" id="support">
        <div class="container mx-auto px-6">
          <div class="max-w-2xl mb-16">
            <span class="uppercase text-emerald-400 tracking-[0.3em] text-xs"
              >Community voices</span
            >
            <h2 class="text-3xl md:text-4xl font-bold mt-4">Experiences that keep people moving</h2>
            <p class="text-gray-400 mt-4">
              Riders and drivers trust us for dependable transportation and a community-first
              approach.
            </p>
          </div>
          <div class="grid gap-10 md:grid-cols-2">
            <figure
              v-for="testimonial in testimonials"
              :key="testimonial.name"
              class="p-10 rounded-3xl border border-gray-800 bg-gray-900/60"
            >
              <p class="text-lg text-gray-200">{{ testimonial.quote }}</p>
              <figcaption class="mt-6 text-sm text-gray-400">
                <span class="text-white font-semibold">{{ testimonial.name }}</span> —
                {{ testimonial.role }}
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      <!-- Footer CTA -->
      <section class="py-20 bg-black">
        <div class="container mx-auto px-6 text-center space-y-6">
          <h2 class="text-3xl md:text-4xl font-bold text-white">Download the app and get moving</h2>
          <p class="text-gray-400 max-w-2xl mx-auto">
            Available on iOS and Android. Create an account, add your payment method, and book your
            first ride in less than two minutes.
          </p>
          <div class="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href="#"
              class="px-6 py-3 bg-white text-gray-900 font-semibold rounded-lg flex items-center justify-center gap-3 hover:bg-gray-200 transition"
            >
              <i class="fab fa-apple text-2xl"></i>
              <div class="text-left text-sm leading-tight">
                <div class="text-xs text-gray-600 uppercase">Download on the</div>
                <div class="text-base font-bold text-gray-900">App Store</div>
              </div>
            </a>
            <a
              href="#"
              class="px-6 py-3 bg-gray-800 text-white font-semibold rounded-lg flex items-center justify-center gap-3 hover:bg-gray-700 transition"
            >
              <i class="fab fa-google-play text-2xl"></i>
              <div class="text-left text-sm leading-tight">
                <div class="text-xs text-gray-400 uppercase">Get it on</div>
                <div class="text-base font-bold text-white">Google Play</div>
              </div>
            </a>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
