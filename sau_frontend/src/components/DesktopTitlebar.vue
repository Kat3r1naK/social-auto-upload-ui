<template>
  <header class="desktop-titlebar" aria-label="SAU Studio 窗口标题栏">
    <div class="desktop-titlebar-brand">
      <img src="/assets/sau-mark.png" alt="" /><span>SAU Studio</span>
    </div>
    <div class="desktop-titlebar-drag"><span>多平台内容发布</span></div>
  </header>
</template>
<style scoped>
.desktop-titlebar {
  display: flex;
  height: var(--desktop-titlebar-height);
  flex-shrink: 0;
  user-select: none;
  -webkit-app-region: drag;
  app-region: drag;
  color: var(--muted);
  background: var(--page);
}
.desktop-titlebar-brand {
  width: var(--sidebar-width);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 24px;
  background: var(--sidebar);
  font-size: 12px;
  font-weight: 550;
}
.desktop-titlebar-brand img {
  width: 17px;
  height: 19px;
  object-fit: contain;
}
.desktop-titlebar-drag {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  padding: 0 168px 0 36px;
  font-size: 11px;
  letter-spacing: 0.4px;
}
@media (max-width: 1080px) {
  .desktop-titlebar-brand {
    padding: 0;
    justify-content: center;
  }
  .desktop-titlebar-brand span {
    display: none;
  }
  .desktop-titlebar-drag {
    padding-left: 28px;
  }
}
</style>
