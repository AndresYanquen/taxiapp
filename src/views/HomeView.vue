<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'

const isMobileMenuOpen = ref(false)

const toggleMobileMenu = () => {
  isMobileMenuOpen.value = !isMobileMenuOpen.value
}
</script>

<template>
  <div class="bg-white text-gray-800">
    <!-- Header -->
    <header class="bg-white shadow-sm sticky top-0 z-50">
      <nav class="container mx-auto px-6 py-4 flex justify-between items-center">
        <RouterLink to="/" class="text-2xl font-bold text-gray-900">
          <i class="fa-solid fa-car-side text-blue-600"></i> {{ $t('app.name') }}
        </RouterLink>

        <div class="md:flex items-center space-x-4">
          <RouterLink
            to="/login"
            class="text-gray-600 font-semibold px-5 py-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {{ $t('login') }}
          </RouterLink>
          <RouterLink
            to="/signup"
            class="bg-blue-600 text-white font-semibold px-5 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            {{ $t('signup') }}
          </RouterLink>
        </div>
        <button @click="toggleMobileMenu" class="md:hidden text-2xl text-gray-700">
          <i :class="isMobileMenuOpen ? 'fas fa-times' : 'fas fa-bars'"></i>
        </button>
      </nav>
      <!-- Mobile Menu -->
      <div v-if="isMobileMenuOpen" class="md:hidden bg-white border-t border-gray-200">
        <a
          href="#features"
          @click="toggleMobileMenu"
          class="block py-3 px-6 text-gray-600 hover:bg-gray-50"
          >Features</a
        >
        <a
          href="#how-it-works"
          @click="toggleMobileMenu"
          class="block py-3 px-6 text-gray-600 hover:bg-gray-50"
          >How It Works</a
        >
        <RouterLink
          to="/about"
          @click="toggleMobileMenu"
          class="block py-3 px-6 text-gray-600 hover:bg-gray-50"
          >About</RouterLink
        >
        <RouterLink
          to="/login"
          @click="toggleMobileMenu"
          class="block py-3 px-6 text-gray-600 hover:bg-gray-50"
          >Login</RouterLink
        >
        <RouterLink
          to="/signup"
          @click="toggleMobileMenu"
          class="block py-3 px-6 bg-blue-50 text-blue-600 font-semibold"
          >Sign Up</RouterLink
        >
      </div>
    </header>

    <!-- Main Content -->
    <main>
      <!-- Hero Section -->
      <section class="hero-bg text-white">
        <div class="container mx-auto px-6 py-24 md:py-32 flex flex-col md:flex-row items-center">
          <div class="md:w-1/2 text-center md:text-left mb-12 md:mb-0">
            <h1 class="text-4xl md:text-6xl font-extrabold leading-tight mb-4">
              {{ $t('homepage.cta.title') }}
            </h1>
            <p class="text-lg md:text-xl text-gray-300 mb-8">
              {{ $t('homepage.cta.subtitle') }}
            </p>
            <!--             <div
              class="flex flex-col sm:flex-row justify-center md:justify-start space-y-4 sm:space-y-0 sm:space-x-4"
            >
              <a
                href="#download"
                class="bg-white text-blue-600 font-bold py-3 px-8 rounded-lg flex items-center justify-center hover:bg-gray-200 transition"
              >
                <i class="fab fa-apple mr-3 text-2xl"></i> App Store
              </a>
              <a
                href="#download"
                class="bg-gray-800 text-white font-bold py-3 px-8 rounded-lg flex items-center justify-center border border-gray-600 hover:bg-gray-700 transition"
              >
                <i class="fab fa-google-play mr-3 text-2xl"></i> Google Play
              </a>
            </div> -->
          </div>
          <div class="md:w-1/2 flex justify-center">
            <img
              src="https://placehold.co/300x600/1f2937/FFFFFF?text=App+Screenshot"
              alt="App Screenshot"
              class="rounded-3xl shadow-2xl border-4 border-gray-700 w-2/3 md:w-auto"
            />
          </div>
        </div>
      </section>

      <!-- Features Section -->
      <section id="features" class="py-20 bg-white">
        <div class="container mx-auto px-6 text-center">
          <h2 class="text-3xl font-bold mb-3">Why Ride with SwiftRide?</h2>
          <p class="text-gray-600 mb-12 max-w-2xl mx-auto">
            We're focused on providing the best experience for riders and drivers in Medellín.
          </p>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-10">
            <!-- Feature 1 -->
            <div
              class="p-8 border border-gray-200 rounded-xl shadow-lg hover:shadow-2xl transition-shadow duration-300"
            >
              <div
                class="feature-icon text-white w-16 h-16 rounded-full flex items-center justify-center text-2xl mx-auto mb-6"
              >
                <i class="fa-solid fa-shield-halved"></i>
              </div>
              <h3 class="text-xl font-semibold mb-2">Safety First</h3>
              <p class="text-gray-600">
                Real-time trip tracking, verified drivers, and 24/7 support ensure your peace of
                mind on every journey.
              </p>
            </div>
            <!-- Feature 2 -->
            <div
              class="p-8 border border-gray-200 rounded-xl shadow-lg hover:shadow-2xl transition-shadow duration-300"
            >
              <div
                class="feature-icon text-white w-16 h-16 rounded-full flex items-center justify-center text-2xl mx-auto mb-6"
              >
                <i class="fa-solid fa-hand-holding-dollar"></i>
              </div>
              <h3 class="text-xl font-semibold mb-2">Transparent Pricing</h3>
              <p class="text-gray-600">
                Know your fare before you book. No hidden fees, no surprises. Just fair, upfront
                pricing.
              </p>
            </div>
            <!-- Feature 3 -->
            <div
              class="p-8 border border-gray-200 rounded-xl shadow-lg hover:shadow-2xl transition-shadow duration-300"
            >
              <div
                class="feature-icon text-white w-16 h-16 rounded-full flex items-center justify-center text-2xl mx-auto mb-6"
              >
                <i class="fa-solid fa-map-location-dot"></i>
              </div>
              <h3 class="text-xl font-semibold mb-2">Local Focus</h3>
              <p class="text-gray-600">
                Our service is optimized for Medellín, ensuring faster pickups and drivers who know
                the city inside and out.
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- How It Works Section -->
      <section id="how-it-works" class="py-20 bg-gray-50">
        <div class="container mx-auto px-6">
          <h2 class="text-3xl font-bold text-center mb-12">Get a Ride in 3 Easy Steps</h2>
          <div class="flex flex-col md:flex-row items-center justify-between">
            <div class="md:w-1/2 mb-10 md:mb-0">
              <img
                src="https://placehold.co/600x400/e5e7eb/374151?text=Map+Illustration"
                alt="Map Illustration"
                class="rounded-xl shadow-lg"
              />
            </div>
            <div class="md:w-1/2 md:pl-16">
              <div class="flex items-start mb-8">
                <div
                  class="bg-blue-600 text-white font-bold w-10 h-10 rounded-full flex items-center justify-center mr-6 shrink-0"
                >
                  1
                </div>
                <div>
                  <h3 class="text-xl font-semibold mb-1">Request</h3>
                  <p class="text-gray-600">
                    Open the app and enter your destination. See your route and fare estimate
                    upfront.
                  </p>
                </div>
              </div>
              <div class="flex items-start mb-8">
                <div
                  class="bg-blue-600 text-white font-bold w-10 h-10 rounded-full flex items-center justify-center mr-6 shrink-0"
                >
                  2
                </div>
                <div>
                  <h3 class="text-xl font-semibold mb-1">Ride</h3>
                  <p class="text-gray-600">
                    A nearby driver accepts your request. Track their arrival in real-time on the
                    map.
                  </p>
                </div>
              </div>
              <div class="flex items-start">
                <div
                  class="bg-blue-600 text-white font-bold w-10 h-10 rounded-full flex items-center justify-center mr-6 shrink-0"
                >
                  3
                </div>
                <div>
                  <h3 class="text-xl font-semibold mb-1">Arrive</h3>
                  <p class="text-gray-600">
                    Enjoy a safe and comfortable ride to your destination. Payment is handled
                    seamlessly in the app.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Call to Action Section -->
      <section id="download" class="bg-gray-100">
        <div class="container mx-auto px-6 py-20 text-center">
          <h2 class="text-3xl font-bold mb-4">Ready to Ride?</h2>
          <p class="text-gray-600 mb-8 max-w-xl mx-auto">
            Download the SwiftRide app today and experience a new standard of travel in Medellín.
          </p>
          <div class="flex flex-col sm:flex-row justify-center space-y-4 sm:space-y-0 sm:space-x-4">
            <a
              href="#"
              class="bg-gray-800 text-white font-bold py-4 px-8 rounded-lg flex items-center justify-center hover:bg-black transition"
            >
              <i class="fab fa-apple mr-3 text-2xl"></i> Download for iOS
            </a>
            <a
              href="#"
              class="bg-gray-800 text-white font-bold py-4 px-8 rounded-lg flex items-center justify-center hover:bg-black transition"
            >
              <i class="fab fa-google-play mr-3 text-2xl"></i> Download for Android
            </a>
          </div>
        </div>
      </section>
    </main>

    <!-- Footer -->
    <footer class="bg-gray-900 text-white">
      <div class="container mx-auto px-6 py-12">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <h4 class="font-bold text-lg mb-4">SwiftRide</h4>
            <a href="#" class="block text-gray-400 hover:text-white mb-2">About Us</a>
            <a href="#" class="block text-gray-400 hover:text-white mb-2">Careers</a>
            <a href="#" class="block text-gray-400 hover:text-white mb-2">Press</a>
          </div>
          <div>
            <h4 class="font-bold text-lg mb-4">Explore</h4>
            <a href="#" class="block text-gray-400 hover:text-white mb-2">Ride</a>
            <a href="#" class="block text-gray-400 hover:text-white mb-2">Drive</a>
            <a href="#" class="block text-gray-400 hover:text-white mb-2">Cities</a>
          </div>
          <div>
            <h4 class="font-bold text-lg mb-4">Support</h4>
            <a href="#" class="block text-gray-400 hover:text-white mb-2">Help Center</a>
            <a href="#" class="block text-gray-400 hover:text-white mb-2">Contact Us</a>
            <a href="#" class="block text-gray-400 hover:text-white mb-2">Safety</a>
          </div>
          <div>
            <h4 class="font-bold text-lg mb-4">Connect</h4>
            <div class="flex space-x-4 text-2xl">
              <a href="#" class="text-gray-400 hover:text-white"><i class="fab fa-facebook"></i></a>
              <a href="#" class="text-gray-400 hover:text-white"><i class="fab fa-twitter"></i></a>
              <a href="#" class="text-gray-400 hover:text-white"
                ><i class="fab fa-instagram"></i
              ></a>
            </div>
          </div>
        </div>
        <div class="mt-12 border-t border-gray-800 pt-8 text-center text-gray-500">
          <p>&copy; 2025 SwiftRide Technologies Inc. All rights reserved.</p>
          <p class="mt-1">
            Made with <i class="fa-solid fa-heart text-red-500"></i> in Medellín, Colombia.
          </p>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* Scoped styles ensure they only apply to this component */
.hero-bg {
  background-color: #111827; /* bg-gray-900 */
  background-image:
    linear-gradient(to bottom, rgba(17, 24, 39, 0.8), rgba(17, 24, 39, 1)),
    url('https://placehold.co/1920x1080/000000/FFFFFF?text=City+at+Night');
  background-size: cover;
  background-position: center;
}
.feature-icon {
  background-image: linear-gradient(to top right, #3b82f6, #1d4ed8);
}
</style>
