import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'

interface UnsavedChangesDialogProps {
  open: boolean
  profesionalNombre: string
  onGuardar: () => void
  onDescartar: () => void
  onCancelar: () => void
}

export function UnsavedChangesDialog({
  open,
  profesionalNombre,
  onGuardar,
  onDescartar,
  onCancelar,
}: UnsavedChangesDialogProps) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cambios sin guardar</AlertDialogTitle>
          <AlertDialogDescription>
            Tienes cambios pendientes en el horario de{' '}
            <span className="font-semibold">{profesionalNombre}</span>. ¿Que deseas hacer?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel onClick={onCancelar}>Volver</AlertDialogCancel>
          <AlertDialogAction
            onClick={onDescartar}
            className="bg-muted text-foreground hover:bg-muted/80"
          >
            Descartar cambios
          </AlertDialogAction>
          <AlertDialogAction onClick={onGuardar}>Guardar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
