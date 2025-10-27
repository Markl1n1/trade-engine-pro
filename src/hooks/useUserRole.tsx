import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

type AppRole = 'admin' | 'moderator' | 'user';

export const useUserRole = () => {
  const { user } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserRole = async () => {
      if (!user) {
        setRole(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        console.log('[USER-ROLE] Fetching role for user:', user.id);
        
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .single();

        if (error) {
          console.error('[USER-ROLE] Database error:', error);
          throw error;
        }

        const userRole = data?.role as AppRole;
        console.log('[USER-ROLE] User role:', userRole);
        
        setRole(userRole);
        setIsAdmin(userRole === 'admin');
        
        console.log('[USER-ROLE] isAdmin set to:', userRole === 'admin');
      } catch (error) {
        console.error('[USER-ROLE] Error fetching user role:', error);
        setRole('user');
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    fetchUserRole();
  }, [user]);

  return { role, isAdmin, loading };
};
