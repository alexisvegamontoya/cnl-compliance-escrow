import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

export function useNotificaciones() {
  const { session } = useAuth()
  const [notifs, setNotifs] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchNotifs = useCallback(async () => {
    if (!session?.user?.id) return
    const { data } = await supabase
      .from('notificaciones')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30)
    if (data) setNotifs(data)
    setLoading(false)
  }, [session?.user?.id])

  // Cargar al montar y suscribirse a cambios en tiempo real
  useEffect(() => {
    fetchNotifs()

    if (!session?.user?.id) return
    const channel = supabase
      .channel('notif_realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notificaciones',
        filter: `user_id=eq.${session.user.id}`,
      }, (payload) => {
        setNotifs(prev => [payload.new, ...prev])
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [fetchNotifs, session?.user?.id])

  const noLeidas = notifs.filter(n => !n.leida).length

  async function marcarLeida(id) {
    await supabase.from('notificaciones').update({ leida: true }).eq('id', id)
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, leida: true } : n))
  }

  async function marcarTodasLeidas() {
    if (!session?.user?.id) return
    await supabase.from('notificaciones').update({ leida: true }).eq('user_id', session.user.id).eq('leida', false)
    setNotifs(prev => prev.map(n => ({ ...n, leida: true })))
  }

  return { notifs, noLeidas, loading, marcarLeida, marcarTodasLeidas, refetch: fetchNotifs }
}
