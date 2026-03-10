# API Test Commands (PowerShell)

All commands use `ADMIN_API_KEY=dev_admin_key_123` (the default dev key).
Change the key value if you set a custom ADMIN_API_KEY in `.env`.

## 1. Health Check (no auth required)

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/health" -Method GET | ConvertTo-Json -Depth 5
```

Or under API prefix:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/health" -Method GET | ConvertTo-Json -Depth 5
```

## 2. Discover Live (full pipeline with commerce + listing_pack)

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/workflows/discover-live" -Method POST -ContentType "application/json" -Headers @{"X-API-Key"="dev_admin_key_123"} -Body '{"keywords":["kitchen gadget","gym recovery","beauty tool","car accessory","smart home gadget"]}' | ConvertTo-Json -Depth 10
```

## 3. Discover Live (skip DB save)

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/workflows/discover-live" -Method POST -ContentType "application/json" -Headers @{"X-API-Key"="dev_admin_key_123"} -Body '{"keywords":["kitchen gadget"],"save":false}' | ConvertTo-Json -Depth 10
```

## 4. List Products (requires DB)

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/products" -Method GET -Headers @{"X-API-Key"="dev_admin_key_123"} | ConvertTo-Json -Depth 5
```

## 5. Get Product Detail (requires DB)

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/products/PRODUCT_ID_HERE" -Method GET -Headers @{"X-API-Key"="dev_admin_key_123"} | ConvertTo-Json -Depth 5
```

## 6. Products Pending Review (requires DB)

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/products/review/pending" -Method GET -Headers @{"X-API-Key"="dev_admin_key_123"} | ConvertTo-Json -Depth 5
```

## 7. Approve Product (requires DB)

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/products/PRODUCT_ID_HERE/approve" -Method POST -ContentType "application/json" -Headers @{"X-API-Key"="dev_admin_key_123"} -Body '{"reviewed_by":"admin","notes":"Good product"}' | ConvertTo-Json -Depth 5
```

## 8. Reject Product (requires DB)

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/products/PRODUCT_ID_HERE/reject" -Method POST -ContentType "application/json" -Headers @{"X-API-Key"="dev_admin_key_123"} -Body '{"reviewed_by":"admin","notes":"Low margin"}' | ConvertTo-Json -Depth 5
```

## 9. Push Approved Product to Salla (requires DB + Salla credentials)

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/products/PRODUCT_ID_HERE/push-to-salla" -Method POST -Headers @{"X-API-Key"="dev_admin_key_123"} | ConvertTo-Json -Depth 5
```

## 10. Salla Connection Status

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/salla/status" -Method GET -Headers @{"X-API-Key"="dev_admin_key_123"} | ConvertTo-Json -Depth 5
```

## 11. Dashboard Stats (requires DB)

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/dashboard/stats" -Method GET -Headers @{"X-API-Key"="dev_admin_key_123"} | ConvertTo-Json -Depth 5
```

## 12. Marketing Queue (requires DB)

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/marketing/queue" -Method GET -Headers @{"X-API-Key"="dev_admin_key_123"} | ConvertTo-Json -Depth 5
```

## 13. Run Full Pipeline (requires DB)

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/workflows/run" -Method POST -ContentType "application/json" -Headers @{"X-API-Key"="dev_admin_key_123"} -Body '{"keywords":["portable blender","massage gun"]}' | ConvertTo-Json -Depth 5
```
