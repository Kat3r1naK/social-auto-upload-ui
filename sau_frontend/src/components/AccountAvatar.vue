<template>
  <span class="account-avatar" aria-hidden="true">
    <img v-if="source && !failed" :src="source" alt="" @error="failed = true" />
    <span v-else>{{ account.name.trim().slice(0, 1) || '?' }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Account } from '@/types/studio'
import { creatorAvatar } from '@/config/platforms'

const props = defineProps<{ account: Account; demo?: boolean }>()
const source = computed(() => props.account.avatarUrl || (props.demo ? creatorAvatar : ''))
const failed = ref(false)
watch(source, () => {
  failed.value = false
})
</script>

<style scoped>
.account-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 49px;
  height: 49px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 50%;
  background: var(--surface-hover, var(--surface));
  color: var(--accent);
  font-size: 1em;
}
.account-avatar img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
