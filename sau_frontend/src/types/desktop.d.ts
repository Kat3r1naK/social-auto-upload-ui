import type { DesktopAPI } from '../../../shared/desktop'
export {}
declare global {
  interface Window {
    sauDesktop?: DesktopAPI
  }
}
