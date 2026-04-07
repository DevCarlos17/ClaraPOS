import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SidebarState {
  isOpen: boolean
  isHovered: boolean
  isMobile: boolean
  setOpen: (open: boolean) => void
  setHovered: (hovered: boolean) => void
  setMobile: (mobile: boolean) => void
  toggle: () => void
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set, get) => ({
      isOpen: false,
      isHovered: false,
      isMobile: false,
      setOpen: (open) => set({ isOpen: open }),
      setHovered: (hovered) => set({ isHovered: hovered }),
      setMobile: (mobile) => set({ isMobile: mobile }),
      toggle: () => set({ isOpen: !get().isOpen }),
    }),
    {
      name: 'clarapos-sidebar',
      partialize: (state) => ({ isOpen: state.isOpen }),
    }
  )
)
