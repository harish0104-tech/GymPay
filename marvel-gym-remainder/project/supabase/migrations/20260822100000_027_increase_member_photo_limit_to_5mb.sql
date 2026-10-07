/* Allow member photos up to 5 MB without a bucket-level MIME allowlist. */

UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = NULL
WHERE id = 'member-photos';
