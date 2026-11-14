import { createRouter, createWebHashHistory } from 'vue-router'
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: () => import('@/views/Dashboard.vue') },
    { path: '/publish-center', component: () => import('@/views/PublishCenter.vue') },
    { path: '/drafts', component: () => import('@/views/DraftBox.vue') },
    { path: '/material-management', component: () => import('@/views/MaterialManagement.vue') },
    { path: '/account-management', component: () => import('@/views/AccountManagement.vue') },
    { path: '/tasks', component: () => import('@/views/TaskCenter.vue') },
    {
      path: '/history',
      component: () => import('@/views/TaskCenter.vue'),
      props: { history: true },
    },
    { path: '/settings', component: () => import('@/views/Settings.vue') },
    { path: '/about', redirect: '/settings' },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
export default router
