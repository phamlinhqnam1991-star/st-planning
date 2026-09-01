# v350 - Fix Batch Compatibility runtime SQL

Fixed runtime error: `column "id" does not exist`.

Cause: `md_main_operation_recipe` has composite primary key `(operation_code, recipe_key)` and no `id` column. The Batch Compatibility recipe-condition loader incorrectly ordered by `id`.

Fix: remove `id` from the query ordering. No database migration is required.
