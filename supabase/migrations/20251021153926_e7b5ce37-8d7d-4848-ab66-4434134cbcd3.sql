-- Grant necessary permissions on vault.secrets to authenticated role
GRANT INSERT, UPDATE ON vault.secrets TO authenticated;