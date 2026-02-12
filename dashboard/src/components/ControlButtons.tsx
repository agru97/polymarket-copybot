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

export default function ControlButtons({
  onAction,
  botState,
}: {
  onAction: () => void
  botState?: string
}) {
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

  const isStopped = botState === 'stopped'

  return (
    <div className="space-y-2">
      {/* Primary contextual action */}
      {isStopped ? (
        <p className="text-xs text-muted-foreground text-center py-1">Bot stopped — restart to resume</p>
      ) : botState === 'paused' ? (
        <Button
          variant="default"
          size="sm"
          onClick={() => handleControl('resume')}
          className="w-full"
        >
          <Play className="h-3.5 w-3.5 mr-1.5" />
          Resume Bot
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleControl('pause')}
          className="w-full text-muted-foreground hover:text-foreground"
        >
          <Pause className="h-3.5 w-3.5 mr-1.5" />
          Pause Bot
        </Button>
      )}

      {/* Emergency stop — smaller, separate, destructive text */}
      {!isStopped && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs text-destructive/70 hover:text-destructive hover:bg-destructive/10"
            >
              <OctagonX className="h-3 w-3 mr-1" />
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
      )}
    </div>
  )
}
