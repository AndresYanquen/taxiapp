<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
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
  <div class="flex items-center justify-center min-h-screen bg-gray-50 py-12">
    <div class="w-full max-w-md p-8 space-y-8 bg-white rounded-2xl shadow-xl">
      <div class="text-center">
        <a href="#" class="text-3xl font-bold text-gray-900">
          <i class="fa-solid fa-car-side text-blue-600"></i> SwiftRide
        </a>
        <h2 class="mt-4 text-2xl font-bold text-gray-900">Create your account</h2>
        <p class="mt-2 text-sm text-gray-600">
          Join us and start riding or driving with SwiftRide.
        </p>
      </div>

      <!-- Role Selector -->
      <div class="flex p-1 bg-gray-200 rounded-lg">
        <button
          @click="role = 'user'"
          :class="[
            'w-1/2 py-2 text-sm font-semibold rounded-md transition-colors',
            role === 'user' ? 'bg-white text-blue-600 shadow' : 'bg-transparent text-gray-600',
          ]"
        >
          I'm a Rider
        </button>
        <button
          @click="role = 'driver'"
          :class="[
            'w-1/2 py-2 text-sm font-semibold rounded-md transition-colors',
            role === 'driver' ? 'bg-white text-blue-600 shadow' : 'bg-transparent text-gray-600',
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
          class="p-3 text-sm text-red-800 bg-red-100 border border-red-200 rounded-lg"
        >
          {{ errorMessage }}
        </div>

        <div class="space-y-4 rounded-md">
          <!-- Full Name -->
          <div>
            <label for="first-name" class="sr-only">First name</label>
            <Field
              id="first-name"
              name="firstName"
              type="text"
              :class="{ 'border-red-500': errors.firstName }"
              class="relative block w-full px-3 py-3 text-gray-900 placeholder-gray-500 border border-gray-300 rounded-md appearance-none focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="First name"
            />
            <ErrorMessage name="firstName" class="text-red-500 text-xs mt-1" />
          </div>

          <div>
            <label for="last-name" class="sr-only">Last name</label>
            <Field
              id="last-name"
              name="lastName"
              type="text"
              :class="{ 'border-red-500': errors.lastName }"
              class="relative block w-full px-3 py-3 text-gray-900 placeholder-gray-500 border border-gray-300 rounded-md appearance-none focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="Last name"
            />
            <ErrorMessage name="lastName" class="text-red-500 text-xs mt-1" />
          </div>
          <!-- Phone Number -->
          <div>
            <label for="phone-number" class="sr-only">Phone number</label>
            <Field
              id="phone-number"
              name="phoneNumber"
              type="tel"
              :class="{ 'border-red-500': errors.phoneNumber }"
              class="relative block w-full px-3 py-3 text-gray-900 placeholder-gray-500 border border-gray-300 rounded-md appearance-none focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="Phone number"
            />
            <p class="text-xs">Te enviaremos un SMS para verificar tu identidad.</p>
            <ErrorMessage name="phoneNumber" class="text-red-500 text-xs mt-1" />
          </div>
          <!-- Email -->
          <div>
            <label for="email-address" class="sr-only">Email address</label>
            <Field
              id="email-address"
              name="email"
              type="email"
              :class="{ 'border-red-500': errors.email }"
              class="relative block w-full px-3 py-3 text-gray-900 placeholder-gray-500 border border-gray-300 rounded-md appearance-none focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="Email address"
            />
            <ErrorMessage name="email" class="text-red-500 text-xs mt-1" />
          </div>
          <!-- Password -->
          <div class="relative">
            <label for="password" class="sr-only">Password</label>
            <Field
              id="password"
              name="password"
              :type="passwordFieldType"
              :class="{ 'border-red-500': errors.password }"
              class="relative block w-full px-3 py-3 pr-16 text-gray-900 placeholder-gray-500 border border-gray-300 rounded-md appearance-none focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="Password"
            />
            <button
              type="button"
              aria-label="Toggle password visibility"
              @click="togglePasswordVisibility"
              class="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 hover:text-gray-700"
            >
              <!-- Better to use icons here, but text works too -->
              <span v-if="isPasswordVisible">Hide</span>
              <span v-else>Show</span>
            </button>
          </div>
          <ErrorMessage name="password" class="text-red-500 text-xs mt-1" />
        </div>

        <div>
          <button
            type="submit"
            :disabled="isLoading"
            class="relative flex justify-center w-full px-4 py-3 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md group hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-300 disabled:cursor-not-allowed"
          >
            <span v-if="isLoading" class="animate-spin mr-2">
              <i class="fa-solid fa-spinner"></i>
            </span>
            {{ isLoading ? 'Creating Account...' : 'Create Account' }}
          </button>
        </div>
      </Form>

      <p class="mt-6 text-sm text-center text-gray-600">
        Already have an account?
        <router-link to="/login" class="font-medium text-blue-600 hover:text-blue-500">
          Sign in
        </router-link>
      </p>
    </div>
  </div>
</template>

<style scoped></style>
