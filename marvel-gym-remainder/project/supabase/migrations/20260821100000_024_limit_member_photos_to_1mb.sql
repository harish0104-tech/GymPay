/* Enforce the same 1 MB member-photo limit on the storage backend. */

UPDATE storage.buckets
SET file_size_limit = 1048576
WHERE id = 'member-photos';
