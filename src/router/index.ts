import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import ImportLoadView from '../views/import/ImportLoadView.vue'
import ImportApplyView from '../views/import/ImportApplyView.vue'
import ExportUploadView from '../views/export/ExportUploadView.vue'
import ExportSelectView from '../views/export/ExportSelectView.vue'
import ExportDetailsView from '../views/export/ExportDetailsView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/import',
      name: 'import-load',
      component: ImportLoadView
    },
    {
      path: '/import/apply',
      name: 'import-apply',
      component: ImportApplyView
    },
    {
      path: '/export',
      redirect: '/export/upload'
    },
    {
      path: '/export/upload',
      name: 'export-upload',
      component: ExportUploadView
    },
    {
      path: '/export/select',
      name: 'export-select',
      component: ExportSelectView
    },
    {
      path: '/export/details',
      name: 'export-details',
      component: ExportDetailsView
    }
  ]
})
