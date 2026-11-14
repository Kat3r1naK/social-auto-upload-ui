import { createApp, h } from 'vue'
import App from './App.vue'
import router from './router'
import pinia from './stores'
import {
  ElButton,
  ElCheckbox,
  ElCheckboxGroup,
  ElConfigProvider,
  ElDatePicker,
  ElDialog,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElForm,
  ElFormItem,
  ElIcon,
  ElImage,
  ElInput,
  ElInputNumber,
  ElOption,
  ElPagination,
  ElRadio,
  ElRadioButton,
  ElRadioGroup,
  ElSelect,
  ElSwitch,
  ElTag,
  ElTooltip,
} from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  Clock,
  Close,
  Collection,
  Connection,
  Delete,
  Document,
  Download,
  EditPen,
  Files,
  FolderOpened,
  Grid,
  House,
  InfoFilled,
  List,
  Loading,
  Moon,
  MoreFilled,
  Picture,
  Plus,
  Promotion,
  Refresh,
  Search,
  Setting,
  Sunny,
  TopRight,
  Upload,
  UploadFilled,
  User,
  VideoCamera,
  VideoPlay,
  Warning,
} from '@element-plus/icons-vue'
import './styles/index.scss'
import { useStudioStore } from './stores/studio'

const app = createApp({ render: () => h(ElConfigProvider, { locale: zhCn }, () => h(App)) })

// Keep string-based dynamic icons, while letting the bundler drop unused icons.
for (const [key, component] of Object.entries({
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  Clock,
  Close,
  Collection,
  Connection,
  Delete,
  Document,
  Download,
  EditPen,
  Files,
  FolderOpened,
  Grid,
  House,
  InfoFilled,
  List,
  Loading,
  Moon,
  MoreFilled,
  Picture,
  Plus,
  Promotion,
  Refresh,
  Search,
  Setting,
  Sunny,
  TopRight,
  Upload,
  UploadFilled,
  User,
  VideoCamera,
  VideoPlay,
  Warning,
})) {
  app.component(key, component)
}

app.use(router)
app.use(pinia)
for (const component of [
  ElButton,
  ElCheckbox,
  ElCheckboxGroup,
  ElDatePicker,
  ElDialog,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElForm,
  ElFormItem,
  ElIcon,
  ElImage,
  ElInput,
  ElInputNumber,
  ElOption,
  ElPagination,
  ElRadio,
  ElRadioButton,
  ElRadioGroup,
  ElSelect,
  ElSwitch,
  ElTag,
  ElTooltip,
])
  app.use(component)
void useStudioStore(pinia)
  .initializeDesktop()
  .finally(() => app.mount('#app'))
