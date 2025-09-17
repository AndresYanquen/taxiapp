<script setup lang="ts">
// El componente ahora recibe su estado (abierto/cerrado) desde el padre
// y emite un evento para notificar cuando debe cerrarse.
defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits(['update:isOpen'])

// Función para emitir el evento de cierre
function closeSidebar() {
  emit('update:isOpen', false)
}
</script>

<template>
  <div>
    <aside
      id="default-sidebar"
      class="fixed top-0 left-0 z-40 w-64 h-screen transition-transform"
      :class="{
        'translate-x-0': isOpen,
        '-translate-x-full': !isOpen,
      }"
      aria-label="Sidebar"
    >
      <div class="h-full px-3 py-4 overflow-y-auto bg-gray-50 dark:bg-gray-800">
        <div class="p-2 mb-4 border-b border-gray-200 dark:border-gray-700">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">John Doe</h2>
          <p class="text-sm text-gray-500 dark:text-gray-400">john.doe@email.com</p>
        </div>

        <ul class="space-y-2 font-medium">
          <li>
            <a
              href="#"
              class="flex items-center p-2 text-gray-900 rounded-lg dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 group"
            >
              <span class="ms-3">Mi Perfil</span>
            </a>
          </li>
          <li>
            <a
              href="#"
              class="flex items-center p-2 text-gray-900 rounded-lg dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 group"
            >
              <span class="ms-3">Historial de Viajes</span>
            </a>
          </li>
          <li>
            <a
              href="#"
              class="flex items-center p-2 text-gray-900 rounded-lg dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 group"
            >
              <span class="ms-3">Métodos de Pago</span>
            </a>
          </li>
          <li>
            <a
              href="#"
              class="flex items-center p-2 text-red-600 rounded-lg dark:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 group"
            >
              <span class="flex-1 ms-3 whitespace-nowrap">Cerrar Sesión</span>
            </a>
          </li>
        </ul>
      </div>
    </aside>

    <div v-if="isOpen" @click="closeSidebar" class="fixed inset-0 z-30 bg-black/50"></div>
  </div>
</template>
