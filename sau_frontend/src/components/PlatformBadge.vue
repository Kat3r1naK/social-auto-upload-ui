<template>
  <span class="platform-badge" :class="{ small }"
    ><img v-if="platform?.logo" :src="platform.logo" :alt="platform.name" /><el-icon v-else
      ><Connection /></el-icon
  ></span>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { getPlatform } from '@/config/platforms'
const props = defineProps<{ id: string; small?: boolean }>()
const platform = computed(() => getPlatform(props.id))
</script>
<style scoped>
.platform-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  color: var(--muted);
}
.platform-badge img {
  width: 28px;
  height: 28px;
  object-fit: contain;
  border-radius: 7px;
}
.platform-badge.small,
.platform-badge.small img {
  width: 24px;
  height: 24px;
}
</style>
