import { useState, useEffect } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AuthError | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'TOKEN_REFRESHED') {
          setError(null);
        }
        
        if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setError(null);
        }

        if (event === 'USER_UPDATED' || event === 'SIGNED_IN') {
          setSession(session);
          setUser(session?.user ?? null);
          setError(null);
        }

        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        setError(error);
        toast({
          variant: 'destructive',
          title: 'Session Error',
          description: 'Your session has expired. Please sign in again.'
        });
      }
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []); // Removed toast from dependencies to prevent unnecessary re-renders

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl
      }
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    return { error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      setError(null);
    }
    return { error };
  };

  const refreshSession = async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error) {
        setError(error);
        toast({
          variant: 'destructive',
          title: 'Session Refresh Failed',
          description: 'Please sign in again to continue.'
        });
        return { error };
      }

      setSession(data.session);
      setUser(data.session?.user ?? null);
      setError(null);
      
      toast({
        title: 'Session Refreshed',
        description: 'Your session has been successfully refreshed.'
      });
      
      return { error: null };
    } catch (err) {
      const authError = err as AuthError;
      setError(authError);
      return { error: authError };
    }
  };

  return {
    user,
    session,
    loading,
    error,
    signUp,
    signIn,
    signOut,
    refreshSession
  };
};
