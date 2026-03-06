-- Fix for "Database error querying schema" on login for manually created users
-- Sets NULL token columns to empty strings ('') in the auth.users table

UPDATE auth.users
SET
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change = COALESCE(email_change, '');
