# Room event info server

This function provides two actions:
1. `?action=validate`
2. `?action=submit`

## `POST /api/room-event-info?action=validate`

Validates a room-event-info JSON body against the JSON schema.

If validation succeeds, returns `200` with body:

```json
{
  valid: true,
}

```

If validation fails, returns `400` with body:

```json
{
  valid: false,
  errors: [
    ⋮
  ]
}
```


## `POST /api/room-event-info?action=submit`

…
