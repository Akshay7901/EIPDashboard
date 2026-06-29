import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { designersApi, Designer } from '@/lib/proposalsApi';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export const useDesigners = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isReviewer1 } = useAuth();

  const designersQuery = useQuery({
    queryKey: ['designers'],
    queryFn: async () => {
      const result = await designersApi.list();
      if (result && typeof result === 'object' && 'error' in result) return [];
      return result;
    },
    staleTime: 60000,
    enabled: isReviewer1,
  });

  const createMutation = useMutation({
    mutationFn: (designer: { email: string; name: string }) => designersApi.create(designer),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['designers'] });
      toast({
        title: 'Designer Added',
        description: `Invite sent to ${variables.email}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add designer',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (designerId: string) => designersApi.delete(designerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['designers'] });
      toast({
        title: 'Designer Deleted',
        description: 'The designer has been removed.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete designer',
        variant: 'destructive',
      });
    },
  });

  return {
    designers: (Array.isArray(designersQuery.data) ? designersQuery.data : []) as Designer[],
    isLoading: designersQuery.isLoading,
    error: designersQuery.error,
    createDesigner: createMutation.mutate,
    isCreating: createMutation.isPending,
    deleteDesigner: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
  };
};