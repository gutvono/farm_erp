"use client"

import { useState } from "react"
import { MapPin, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { deleteTalhao, getAtividades } from "@/services/pcp"
import { Plot, PlotActivity } from "@/types/index"
import { formatDate } from "@/lib/utils"

const ACTIVITY_LABELS: Record<string, string> = {
  plantio: "Plantio",
  adubacao: "Adubação",
  poda: "Poda",
  colheita: "Colheita",
  irrigacao: "Irrigação",
  outra: "Outra",
}

interface TalhaoCardProps {
  plot: Plot
  onEdit: () => void
  onDeleted: () => void
}

export function TalhaoCard({ plot, onEdit, onDeleted }: TalhaoCardProps) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [activitiesOpen, setActivitiesOpen] = useState(false)
  const [activities, setActivities] = useState<PlotActivity[]>([])
  const [activitiesLoading, setActivitiesLoading] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteTalhao(plot.id)
      toast.success("Talhão excluído com sucesso")
      onDeleted()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir talhão")
    } finally {
      setDeleting(false)
      setDeleteOpen(false)
    }
  }

  async function handleOpenActivities() {
    setActivitiesOpen(true)
    setActivitiesLoading(true)
    try {
      const data = await getAtividades(plot.id)
      setActivities(data)
    } catch {
      toast.error("Erro ao carregar atividades")
    } finally {
      setActivitiesLoading(false)
    }
  }

  return (
    <>
      <Card className="border-slate-200">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base font-semibold text-slate-800">
              {plot.name}
            </CardTitle>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button variant="ghost" size="icon" onClick={onEdit}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={deleting}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-2">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-slate-500">Variedade</span>
              <p className="font-medium text-slate-700">{plot.variety}</p>
            </div>
            <div>
              <span className="text-slate-500">Capacidade</span>
              <p className="font-medium text-slate-700">{plot.capacity_sacas} sacas</p>
            </div>
          </div>

          {plot.location && (
            <div className="flex items-center gap-1 text-sm text-slate-500">
              <MapPin className="h-3 w-3" />
              {plot.location}
            </div>
          )}

          {plot.notes && (
            <p className="text-sm text-slate-500 italic">{plot.notes}</p>
          )}

          <Button
            variant="outline"
            size="sm"
            className="w-full mt-2"
            onClick={handleOpenActivities}
          >
            Ver Atividades
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir talhão?</AlertDialogTitle>
            <AlertDialogDescription>
              O talhão <strong>{plot.name}</strong> será excluído. Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={activitiesOpen} onOpenChange={setActivitiesOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Atividades — {plot.name}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {activitiesLoading ? (
              <p className="text-slate-400 text-center py-8">Carregando...</p>
            ) : activities.length === 0 ? (
              <p className="text-slate-400 text-center py-8">Nenhuma atividade registrada</p>
            ) : (
              activities.map((act) => (
                <div key={act.id} className="rounded-md border p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">
                      {ACTIVITY_LABELS[act.activity_type] ?? act.activity_type}
                    </span>
                    <span className="text-xs text-slate-500">
                      {formatDate(act.activity_date)}
                    </span>
                  </div>
                  {act.details && (
                    <p className="text-sm text-slate-600">{act.details}</p>
                  )}
                  <p className="text-xs text-slate-400 capitalize">{act.labor_type}</p>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
