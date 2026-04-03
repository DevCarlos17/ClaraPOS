import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'
import { connector } from '@/core/db/powersync/connector'
import { toast } from 'sonner'

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})

  const validateForm = () => {
    const newErrors: { email?: string; password?: string } = {}
    if (!email) {
      newErrors.email = 'El correo electronico es requerido'
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Correo electronico invalido'
    }
    if (!password) {
      newErrors.password = 'La contrasena es requerida'
    } else if (password.length < 6) {
      newErrors.password = 'La contrasena debe tener al menos 6 caracteres'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    setIsLoading(true)
    try {
      await connector.login(email, password)
      toast.success('Bienvenido')
      navigate({ to: '/dashboard' })
    } catch (error: unknown) {
      const err = error as { message?: string }
      toast.error(err.message || 'Error al iniciar sesion')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container relative grid h-svh flex-col items-center justify-center lg:max-w-none lg:grid-cols-2 lg:px-0">
      {/* Left panel */}
      <div className="relative hidden h-full flex-col bg-muted p-10 text-white lg:flex">
        <div className="absolute inset-0 bg-primary" />
        <div className="relative z-20 flex items-center gap-2 text-lg font-medium">
          <span className="text-3xl font-bold">N21</span>
          Nexo21
        </div>
        <div className="relative z-20 mt-auto">
          <blockquote className="space-y-2">
            <p className="text-lg">
              &ldquo;Sistema POS y gestion de negocio offline-first. Controla tu inventario,
              ventas y clientes desde cualquier lugar.&rdquo;
            </p>
          </blockquote>
        </div>
      </div>

      {/* Right form */}
      <div className="lg:p-8">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          <div className="flex flex-col space-y-2 text-left">
            <h1 className="text-2xl font-semibold tracking-tight">Iniciar sesion</h1>
            <p className="text-sm text-muted-foreground">
              Introduce tu correo electronico y contrasena.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Correo</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="email"
                  placeholder="usuario@nexo21.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
                />
              </div>
              {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Contrasena</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-10 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-destructive mt-1">{errors.password}</p>}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center justify-center w-full h-10 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              {isLoading ? 'Iniciando sesion...' : 'Iniciar sesion'}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            No tienes cuenta?{' '}
            <button
              type="button"
              onClick={() => navigate({ to: '/register' })}
              className="text-primary underline-offset-4 hover:underline font-medium"
            >
              Registrate
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
