import Vue from 'vue'
import router from './router'
import store from './store'

import NProgress from 'nprogress' // progress bar
import 'nprogress/nprogress.css' // progress bar style
import notification from 'ant-design-vue/es/notification'
import { setDocumentTitle, domTitle } from '@/utils/domUtil'
import { ACCESS_TOKEN } from '@/store/mutation-types'

NProgress.configure({ showSpinner: false }) // NProgress Configuration

const whiteList = ['login'] // no redirect whitelist

// Cache for bypass auth status
let bypassAuthChecked = false
let bypassAuthEnabled = false

async function checkBypassAuth () {
  if (bypassAuthChecked) {
    return bypassAuthEnabled
  }
  try {
    const response = await Vue.http.get('auth/config')
    bypassAuthEnabled = response.body && response.body.bypass_auth === true
    if (bypassAuthEnabled) {
      // Set a dummy token so the app works without login
      Vue.ls.set(ACCESS_TOKEN, 'bypass', 7 * 24 * 60 * 60 * 1000)
    }
  } catch (e) {
    bypassAuthEnabled = false
  }
  bypassAuthChecked = true
  return bypassAuthEnabled
}

router.beforeEach(async (to, from, next) => {
  NProgress.start() // start progress bar
  to.meta && (typeof to.meta.title !== 'undefined' && setDocumentTitle(`${to.meta.title} - ${domTitle}`))

  // Check if bypass auth is enabled
  const bypassed = await checkBypassAuth()

  if (Vue.ls.get(ACCESS_TOKEN) || bypassed) {
    /* has token or bypass enabled */
    if (to.path === '/user/login') {
      next({ path: '/dashboard' })
      NProgress.done()
    } else {
      if (store.getters.roles.length === 0) {
        // In bypass mode, skip GetInfo and just set up routes directly
        if (bypassed) {
          store.commit('SET_ROLES', 'admin')
          store.commit('SET_NAME', { name: 'admin', welcome: '' })
          store.dispatch('GenerateRoutes', { roles: 'admin' }).then(() => {
            next({ name: 'dashboard', replace: true })
          })
        } else {
          store
            .dispatch('GetInfo')
            .then(() => {
              const roles = store.getters.roles
              store.dispatch('GenerateRoutes', { roles }).then(() => {
                const redirect = decodeURIComponent(from.query.redirect || to.path)
                if (to.path === redirect) {
                  // hack,set the replace: true so the navigation will not leave a history record
                  next({ ...to, replace: true })
                } else {
                  // jump to destination route
                  next({ path: redirect })
                }
              })
            })
            .catch((error) => {
              notification.error({
                message: 'Error',
                description: `Requesting user information failed, please try again, error: ${error.body}`
              })
              store.dispatch('Logout').then(() => {
                next({ path: '/user/login', query: { redirect: to.fullPath } })
              })
            })
        }
      } else {
        next()
      }
    }
  } else {
    if (whiteList.includes(to.name)) {
      // In the free login whitelist, go directly
      next()
    } else {
      next({ path: '/user/login', query: { redirect: to.fullPath } })
      NProgress.done() // if current page is login will not trigger afterEach hook, so manually handle it
    }
  }
})

router.afterEach(() => {
  NProgress.done() // finish progress bar
})
