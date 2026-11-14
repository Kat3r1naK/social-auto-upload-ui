<template>
  <section class="platform-options">
    <h3>平台发布设置</h3>
    <p class="field-hint">分类、封面和创作声明按各平台分别设置。</p>
    <div v-for="id in platformIds" :key="id" class="platform-option-group">
      <h4>{{ getPlatform(id)?.name }}</h4>
      <p v-if="loading[id]" class="field-hint">正在读取平台选项…</p>
      <div v-else-if="errors[id]" class="notice">
        <span>{{ errors[id] }}</span><el-button text @click="load(id)">重试</el-button>
      </div>
      <p v-else-if="!schemas[id]?.length" class="field-hint">此内容类型没有额外的必填设置。</p>
      <el-form v-else label-position="top">
        <el-form-item
          v-for="option in schemas[id]"
          :key="option.key"
          :label="option.label"
          :required="option.required"
        >
          <el-select
            v-if="option.type === 'select'"
            :model-value="value(id, option)"
            clearable
            @update:model-value="setValue(id, option.key, $event)"
          >
            <el-option
              v-for="choice in option.choices"
              :key="choice"
              :label="choice"
              :value="choice"
            />
          </el-select>
          <el-switch
            v-else-if="option.type === 'boolean'"
            :model-value="Boolean(value(id, option))"
            @update:model-value="setValue(id, option.key, Boolean($event))"
          />
          <el-input-number
            v-else-if="option.type === 'number'"
            :model-value="value(id, option) as number | undefined"
            :precision="0"
            @update:model-value="setValue(id, option.key, $event ?? '')"
          />
          <div v-else-if="option.type === 'file'" class="option-file">
            <el-input
              :model-value="String(value(id, option) || '')"
              readonly
              placeholder="请选择本机文件"
            /><el-button @click="chooseFile(id, option.key)">选择文件</el-button>
          </div>
          <el-input
            v-else
            :model-value="String(value(id, option) || '')"
            :placeholder="option.required ? '请填写' + option.label : '可选'"
            @update:model-value="setValue(id, option.key, $event)"
          />
          <p v-if="option.hint" class="option-hint">{{ option.hint }}</p>
        </el-form-item>
      </el-form>
    </div>
  </section>
</template>
<script setup lang="ts">
import { reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getPlatform } from '@/config/platforms'
import type { ContentKind } from '@/types/studio'
import type { PlatformOption } from '../../../shared/desktop'
type Values = Record<string, Record<string, string | number | boolean>>
const props = defineProps<{ platformIds: string[]; kind: ContentKind; modelValue?: Values }>()
const emit = defineEmits<{ 'update:modelValue': [value: Values] }>()
const schemas = reactive<Record<string, PlatformOption[]>>({}),
  errors = reactive<Record<string, string>>({}),
  loading = reactive<Record<string, boolean>>({})
let generation = 0
async function load(id: string, currentGeneration = generation) {
  loading[id] = true
  errors[id] = ''
  try {
    const schema = await window.sauDesktop!.options(id, props.kind)
    if (currentGeneration === generation) schemas[id] = schema
  } catch (error) {
    if (currentGeneration === generation) errors[id] = String(error).replace(/^Error: /, '')
  } finally {
    if (currentGeneration === generation) loading[id] = false
  }
}
watch(
  () => [props.kind, props.platformIds.join(',')],
  () => {
    generation++
    for (const id of props.platformIds) void load(id)
  },
  { immediate: true },
)
function value(id: string, option: PlatformOption) {
  return props.modelValue?.[id]?.[option.key] ?? option.default
}
function setValue(id: string, key: string, value: string | number | boolean) {
  emit('update:modelValue', {
    ...props.modelValue,
    [id]: { ...props.modelValue?.[id], [key]: value },
  })
}
async function chooseFile(id: string, key: string) {
  try {
    const path = await window.sauDesktop!.chooseOptionFile()
    if (path) setValue(id, key, path)
  } catch (error) {
    ElMessage.error(String(error))
  }
}
</script>
<style scoped>
.platform-options {
  border-top: 1px solid var(--stroke);
  padding-top: 24px;
  margin-bottom: 26px;
}
.platform-options h3 {
  font-size: 17px;
  margin-bottom: 8px;
}
.platform-option-group {
  margin-top: 20px;
}
.platform-option-group h4 {
  color: var(--secondary);
  margin-bottom: 16px;
}
.option-hint {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.7;
  margin-top: 6px;
  width: 100%;
}
.option-file {
  display: flex;
  gap: 10px;
  width: 100%;
}
.el-select {
  width: 100%;
}
.field-hint {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.7;
}
</style>
