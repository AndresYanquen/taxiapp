<script setup lang="ts">
import { ref, computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { Form, Field, ErrorMessage, configure } from 'vee-validate'
import { useAuthStore } from '@/stores/auth.store'
import * as yup from 'yup'

configure({
  validateOnBlur: true, // controls if `blur` events should trigger validation with `handleChange` handler
  validateOnChange: true, // controls if `change` events should trigger validation with `handleChange` handler
  validateOnInput: true, // controls if `input` events should trigger validation with `handleChange` handler
  validateOnModelUpdate: true, // controls if `update:modelValue` events should trigger validation with `handleChange` handler
})

// --- Yup Validation Schema ---
// This schema defines all the validation rules for the form.
const schema = yup.object({
  firstName: yup // <-- CAMBIADO de 'name'
    .string()
    .required('El nombre es obligatorio')
    .min(2, 'Debe contener al menos 2 caracteres'),
  lastName: yup // <-- AÑADIDO
    .string()
    .required('El apellido es obligatorio')
    .min(2, 'Debe contener al menos 2 caracteres'),
  phoneNumber: yup
    .string()
    .required('El número de teléfono es obligatorio')
    .matches(/^[0-9]{10}$/, 'El número debe ser de 10 dígitos'),
  email: yup
    .string()
    .required('El correo electrónico es obligatorio')
    .email('Debe ser un correo electrónico válido'),
  password: yup
    .string()
    .required('La contraseña es obligatoria')
    .min(8, 'Debe contener al menos 8 caracteres'),
})

type Role = 'user' | 'driver'

// --- Component State ---
const role = ref<Role>('user')
const isLoading = ref(false)
const errorMessage = ref('')
const router = useRouter()
const isPasswordVisible = ref(false)

const togglePasswordVisibility = () => {
  isPasswordVisible.value = !isPasswordVisible.value
}

const authStore = useAuthStore()

const passwordFieldType = computed(() => {
  return isPasswordVisible.value ? 'text' : 'password'
})
console.log('VITE_BACKEND_URL', import.meta.env.VITE_BACKEND_URL)

// --- Form Submission Handler ---
// VeeValidate passes the form values automatically on successful validation.
const handleSignup = async (values: any) => {
  errorMessage.value = ''
  if (isLoading.value) return

  isLoading.value = true

  const registrationType =
    role.value === 'driver' ? '/api/auth/register/driver' : '/api/auth/register/user'

  try {
    const response = await fetch(import.meta.env.VITE_BACKEND_URL + registrationType, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // `values` object comes directly from VeeValidate
      body: JSON.stringify({
        firstName: values.firstName,
        lastName: values.lastName,
        phoneNumber: values.phoneNumber,
        email: values.email,
        password: values.password,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.message || 'Could not create account. Please check your details.')
    }

    console.log('Signup successful:', data)
    authStore.saveTokenOnSignUp(data)
    if (role.value === 'user') {
      router.push('/request-ride')
    } else {
      router.push('/driver')
    }
  } catch (error: any) {
    console.error('Signup failed:', error)
    errorMessage.value = error.message
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-gray-100 px-6 py-16 flex items-center justify-center">
    <div class="w-full max-w-6xl grid gap-12 lg:grid-cols-2 items-start">
      <div class="space-y-6 text-center lg:text-left">
        <RouterLink to="/" class="inline-flex items-center text-3xl font-bold text-white">
          <i class="fa-solid fa-car-side text-emerald-400 mr-3"></i>{{ $t('app.name') || 'SwiftRide' }}
        </RouterLink>
        <div class="space-y-4">
          <h1 class="text-4xl font-black leading-tight">Create your SwiftRide account</h1>
          <p class="text-gray-400 text-lg max-w-xl mx-auto lg:mx-0">
            Join the SwiftRide community and unlock seamless transportation with real-time tracking,
            trusted drivers, and a city-first experience designed for Medellín.
          </p>
        </div>
        <div class="hidden lg:flex flex-col gap-5 text-sm text-gray-400">
          <div class="flex items-center gap-4">
            <span class="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
              <i class="fa-solid fa-bolt"></i>
            </span>
            Instant verification and onboarding for both riders and drivers
          </div>
          <div class="flex items-center gap-4">
            <span class="inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
              <i class="fa-solid fa-star"></i>
            </span>
            Keep your 5-star reputation with secure profiles and reviews
          </div>
        </div>
      </div>

      <div class="bg-gray-900/60 border border-gray-800 rounded-3xl p-8 shadow-[0_25px_70px_-35px_rgba(16,185,129,0.45)] backdrop-blur">
        <div class="text-center space-y-2">
          <h2 class="text-2xl font-bold text-white">Choose how you ride</h2>
          <p class="text-sm text-gray-400">Tell us who you are and we'll tailor the experience.</p>
        </div>

        <div class="mt-6 grid grid-cols-2 gap-3 rounded-2xl border border-gray-800 bg-gray-900/80 p-2">
          <button
            @click="role = 'user'"
            type="button"
            :class="[
              'rounded-xl px-4 py-3 text-sm font-semibold transition-colors',
              role === 'user'
                ? 'bg-emerald-500 text-gray-900 shadow-lg shadow-emerald-500/30'
                : 'text-gray-400 hover:text-white'
            ]"
          >
            I'm a Rider
          </button>
          <button
            @click="role = 'driver'"
            type="button"
            :class="[
              'rounded-xl px-4 py-3 text-sm font-semibold transition-colors',
              role === 'driver'
                ? 'bg-emerald-500 text-gray-900 shadow-lg shadow-emerald-500/30'
                : 'text-gray-400 hover:text-white'
            ]"
          >
            I'm a Driver
          </button>
        </div>

        <Form
          class="mt-8 space-y-6"
          @submit="handleSignup"
          :validation-schema="schema"
          v-slot="{ errors }"
          validate-on-input
        >
          <div
            v-if="errorMessage"
            class="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          >
            {{ errorMessage }}
          </div>

          <div class="space-y-5">
            <div>
              <label for="first-name" class="sr-only">First name</label>
              <Field
                id="first-name"
                name="firstName"
                type="text"
                :class="[
                  'block w-full rounded-2xl border bg-gray-900 px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2',
                  errors.firstName
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500/40'
                    : 'border-gray-800 focus:border-emerald-500 focus:ring-emerald-500/40'
                ]"
                placeholder="First name"
              />
              <ErrorMessage name="firstName" class="mt-1 text-xs text-red-300" />
            </div>

            <div>
              <label for="last-name" class="sr-only">Last name</label>
              <Field
                id="last-name"
                name="lastName"
                type="text"
                :class="[
                  'block w-full rounded-2xl border bg-gray-900 px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2',
                  errors.lastName
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500/40'
                    : 'border-gray-800 focus:border-emerald-500 focus:ring-emerald-500/40'
                ]"
                placeholder="Last name"
              />
              <ErrorMessage name="lastName" class="mt-1 text-xs text-red-300" />
            </div>

            <div>
              <label for="phone-number" class="sr-only">Phone number</label>
              <Field
                id="phone-number"
                name="phoneNumber"
                type="tel"
                :class="[
                  'block w-full rounded-2xl border bg-gray-900 px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2',
                  errors.phoneNumber
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500/40'
                    : 'border-gray-800 focus:border-emerald-500 focus:ring-emerald-500/40'
                ]"
                placeholder="Phone number"
              />
              <p class="mt-1 text-xs text-gray-500">Te enviaremos un SMS para verificar tu identidad.</p>
              <ErrorMessage name="phoneNumber" class="mt-1 text-xs text-red-300" />
            </div>

            <div>
              <label for="email-address" class="sr-only">Email address</label>
              <Field
                id="email-address"
                name="email"
                type="email"
                :class="[
                  'block w-full rounded-2xl border bg-gray-900 px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2',
                  errors.email
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500/40'
                    : 'border-gray-800 focus:border-emerald-500 focus:ring-emerald-500/40'
                ]"
                placeholder="Email address"
              />
              <ErrorMessage name="email" class="mt-1 text-xs text-red-300" />
            </div>

            <div class="relative">
              <label for="password" class="sr-only">Password</label>
              <Field
                id="password"
                name="password"
                :type="passwordFieldType"
                :class="[
                  'block w-full rounded-2xl border bg-gray-900 px-4 py-3 pr-16 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2',
                  errors.password
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500/40'
                    : 'border-gray-800 focus:border-emerald-500 focus:ring-emerald-500/40'
                ]"
                placeholder="Password"
              />
              <button
                type="button"
                aria-label="Toggle password visibility"
                @click="togglePasswordVisibility"
                class="absolute inset-y-0 right-0 flex items-center px-4 text-sm font-semibold text-gray-400 transition hover:text-white"
              >
                <span v-if="isPasswordVisible">Hide</span>
                <span v-else>Show</span>
              </button>
              <ErrorMessage name="password" class="mt-1 text-xs text-red-300" />
            </div>
          </div>

          <button
            type="submit"
            :disabled="isLoading"
            class="flex w-full items-center justify-center gap-3 rounded-2xl border border-transparent bg-emerald-500 px-6 py-3 font-semibold uppercase tracking-wide text-gray-900 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-gray-950 disabled:cursor-not-allowed disabled:bg-emerald-500/60"
          >
            <span v-if="isLoading" class="animate-spin text-gray-900">
              <i class="fa-solid fa-spinner"></i>
            </span>
            {{ isLoading ? 'Creating Account...' : 'Create Account' }}
          </button>
        </Form>

        <p class="mt-8 text-center text-sm text-gray-400">
          Already have an account?
          <RouterLink to="/login" class="font-semibold text-emerald-400 hover:text-emerald-300">
            Sign in
          </RouterLink>
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
