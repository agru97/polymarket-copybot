import { useState } from 'react'
import { addTrader } from '@/api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'

export default function AddTraderDialog({ onAdd }: { onAdd: () => void }) {
  const [open, setOpen] = useState(false)
  const [addr, setAddr] = useState('')
  const [label, setLabel] = useState('')
  const [bucket, setBucket] = useState('grinder')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!addr.trim()) return
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      toast.error('Invalid Ethereum address')
      return
    }
    setLoading(true)
    try {
      const res = await addTrader(addr, bucket, label || undefined)
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success('Trader added successfully')
      setAddr('')
      setLabel('')
      setOpen(false)
      onAdd()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add trader')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          Add Trader
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Trader</DialogTitle>
          <DialogDescription>
            Add a new wallet to monitor and copy trades from.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="address">Wallet Address</Label>
            <Input
              id="address"
              value={addr}
              onChange={(e) => setAddr(e.target.value)}
              placeholder="0x..."
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="label">Label (optional)</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Alpha Trader"
            />
          </div>
          <div className="space-y-2">
            <Label>Bucket</Label>
            <Select value={bucket} onValueChange={setBucket}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="grinder">Grinder</SelectItem>
                <SelectItem value="event">Event</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Adding...' : 'Add Trader'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
