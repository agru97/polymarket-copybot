import { controlBot } from '@/api'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Pause, Play, OctagonX } from 'lucide-react'
import { toast } from 'sonner'

export default function ControlButtons({ onAction }: { onAction: () => void }) {
  const handleControl = async (action: 'pause' | 'resume' | 'emergency-stop') => {
    try {
      const res = await controlBot(action)
      if (res.success) {
        toast.success(`Bot ${action === 'pause' ? 'paused' : action === 'resume' ? 'resumed' : 'stopped'}`)
        onAction()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Control failed')
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleControl('pause')}
        className="border-warning/50 text-warning hover:bg-warning/10 flex-1"
      >
        <Pause className="h-3.5 w-3.5 mr-1.5" />
        Pause
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleControl('resume')}
        className="border-profit/50 text-profit hover:bg-profit/10 flex-1"
      >
        <Play className="h-3.5 w-3.5 mr-1.5" />
        Resume
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm" className="flex-1">
            <OctagonX className="h-3.5 w-3.5 mr-1.5" />
            Emergency Stop
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Emergency Stop</AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately halt ALL trading. The bot will stop until manually restarted.
              Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleControl('emergency-stop')}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Stop Everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
