'use client'
import { apiRoutes } from './api'
export interface User {
    id: string
    email: string
    name?: string
    role?: string
  }
  
  export interface Company {
    id: string
    name: string
    code: string
  }
  
  export function setUser(user: User) {
    if (typeof window === 'undefined') return
    localStorage.setItem('user', JSON.stringify(user))
  }
  
  export function getUser(): User | null {
    if (typeof window === 'undefined') return null
    try {
      const userStr = localStorage.getItem('user')
      if (!userStr) return null
      return JSON.parse(userStr)
    } catch (error) {
      console.error('Error parsing user data:', error)
      return null
    }
  }
  

  // should this get company or organisation ? if we want to get org, then we already have the subdomain so is it needed?
  export function setCompany(company: Company) {
    if (typeof window === 'undefined') return
    localStorage.setItem('selectedCompany', JSON.stringify(company))
  }
  
  export function getCompany(): Company | null {
    if (typeof window === 'undefined') return null
    try {
      const companyStr = localStorage.getItem('selectedCompany')
      if (!companyStr) return null
      return JSON.parse(companyStr)
    } catch (error) {
      console.error('Error parsing company data:', error)
      return null
    }
  }
  
  // export function isAuthenticated(): boolean {
  //   if (typeof window === 'undefined') return false
  //   const user = getUser()
  //   return user !== null
  // }
  
  /**
   * Log the browser out: ask the backend to expire the httpOnly auth cookies
   * (document.cookie cannot touch them), drop every cached value (sidebar
   * companies/menus are cached per user) and go back to the login page.
   * Always ends on the login page, even if the backend call fails.
   */
  export async function logout() {
    if (typeof window === 'undefined') return
    try {
      await fetch(apiRoutes.LOGOUT, { method: 'POST', credentials: 'include', keepalive: true })
    } catch (error) {
      console.warn('Logout request failed; clearing local session anyway', error)
    }
    localStorage.clear()
    // Redirect to login
    window.location.href = '/'
  }

  /**
   * Handle API auth errors (401/403) by logging out and redirecting.
   * Returns true if the error was an auth error and handled, false otherwise.
   * @param status - HTTP status code from API response
   */
  export function handleAuthError(status: number): boolean {
    if (status === 401 || status === 403) {
      logout()
      return true
    }
    return false
  }

  export function urlcheck() {
    let compshow = 1;
    let currentHost = "";
  
    if (typeof window !== 'undefined') {
      currentHost = window.location.host; // Get current domain on client side
      console.log("Detected Host:", currentHost, window.location.href);
      
      if (currentHost === "admin.vowerp.co.in" || currentHost === "localhost:3001") {
        compshow = 1;
      } else {
        compshow = 2;
      }
    }
  
    return { compshow, currentHost };
  }

// if for testing should we remove this now ?
  export function urlfixed() {
    const subdomain = "vowsls3.vowerp.co.in"; 
   
    return { subdomain}
  }