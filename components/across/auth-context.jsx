'use client'

import { createContext, useContext } from 'react'

export const AuthContext = createContext({ user: null, refresh: () => {}, logout: () => {} })
export const useAuth = () => useContext(AuthContext)
