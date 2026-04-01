# DevelopersApi

All URIs are relative to *https://api.pcssoft.com/api/location*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**addTrailerLocation**](DevelopersApi.md#addtrailerlocation) | **POST** /trailer | Adding a Trailer Location |
| [**addTruckLocation**](DevelopersApi.md#addtrucklocation) | **POST** /truck | Adding a Truck Location |
| [**getDriverLocation**](DevelopersApi.md#getdriverlocation) | **GET** /driver/{driverId} | Returning a Driver Location |
| [**getTrailerLocation**](DevelopersApi.md#gettrailerlocation) | **GET** /trailer/{locationId} | Returning a Trailer Location |
| [**getTrailerLocations**](DevelopersApi.md#gettrailerlocations) | **GET** /trailer | Returning Trailer Locations |
| [**getTruckLocation**](DevelopersApi.md#gettrucklocation) | **GET** /truck/{locationId} | Returning a Truck Location |
| [**getTruckLocations**](DevelopersApi.md#gettrucklocations) | **GET** /truck | Returning Truck Locations |



## addTrailerLocation

> LocationId addTrailerLocation(ocpApimSubscriptionKey, location)

Adding a Trailer Location

Adds a trailer location using a POST method.

### Example

```ts
import {
  Configuration,
  DevelopersApi,
} from '@pcs/location-api';
import type { AddTrailerLocationRequest } from '@pcs/location-api';

async function example() {
  console.log("🚀 Testing @pcs/location-api SDK...");
  const api = new DevelopersApi();

  const body = {
    // string
    ocpApimSubscriptionKey: ocpApimSubscriptionKey_example,
    // Location | Inventory items available to be added. (optional)
    location: ...,
  } satisfies AddTrailerLocationRequest;

  try {
    const data = await api.addTrailerLocation(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **ocpApimSubscriptionKey** | `string` |  | [Defaults to `undefined`] |
| **location** | [Location](Location.md) | Inventory items available to be added. | [Optional] |

### Return type

[**LocationId**](LocationId.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | A new location was added. |  -  |
| **400** | Invalid input or object invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## addTruckLocation

> LocationId addTruckLocation(ocpApimSubscriptionKey, location)

Adding a Truck Location

Adds a truck location using a POST request.

### Example

```ts
import {
  Configuration,
  DevelopersApi,
} from '@pcs/location-api';
import type { AddTruckLocationRequest } from '@pcs/location-api';

async function example() {
  console.log("🚀 Testing @pcs/location-api SDK...");
  const api = new DevelopersApi();

  const body = {
    // string
    ocpApimSubscriptionKey: ocpApimSubscriptionKey_example,
    // Location | Adding a truck location. (optional)
    location: ...,
  } satisfies AddTruckLocationRequest;

  try {
    const data = await api.addTruckLocation(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **ocpApimSubscriptionKey** | `string` |  | [Defaults to `undefined`] |
| **location** | [Location](Location.md) | Adding a truck location. | [Optional] |

### Return type

[**LocationId**](LocationId.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | A new location was added. |  -  |
| **400** | Invalid input or object invalid. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getDriverLocation

> Location getDriverLocation(ocpApimSubscriptionKey, driverId)

Returning a Driver Location

Returns a drivers location using a GET request.

### Example

```ts
import {
  Configuration,
  DevelopersApi,
} from '@pcs/location-api';
import type { GetDriverLocationRequest } from '@pcs/location-api';

async function example() {
  console.log("🚀 Testing @pcs/location-api SDK...");
  const api = new DevelopersApi();

  const body = {
    // string
    ocpApimSubscriptionKey: ocpApimSubscriptionKey_example,
    // number
    driverId: 56,
  } satisfies GetDriverLocationRequest;

  try {
    const data = await api.getDriverLocation(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **ocpApimSubscriptionKey** | `string` |  | [Defaults to `undefined`] |
| **driverId** | `number` |  | [Defaults to `undefined`] |

### Return type

[**Location**](Location.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | The driver\&#39;s location is returned. |  -  |
| **404** | The record matching the driver Id was not found. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getTrailerLocation

> Location getTrailerLocation(ocpApimSubscriptionKey, locationId)

Returning a Trailer Location

Returns a trailer location using a GET request.

### Example

```ts
import {
  Configuration,
  DevelopersApi,
} from '@pcs/location-api';
import type { GetTrailerLocationRequest } from '@pcs/location-api';

async function example() {
  console.log("🚀 Testing @pcs/location-api SDK...");
  const api = new DevelopersApi();

  const body = {
    // string
    ocpApimSubscriptionKey: ocpApimSubscriptionKey_example,
    // number
    locationId: 56,
  } satisfies GetTrailerLocationRequest;

  try {
    const data = await api.getTrailerLocation(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **ocpApimSubscriptionKey** | `string` |  | [Defaults to `undefined`] |
| **locationId** | `number` |  | [Defaults to `undefined`] |

### Return type

[**Location**](Location.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | The trailer location was returned. |  -  |
| **400** | Bad input parameter. |  -  |
| **404** | The record matching the location id was not found. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getTrailerLocations

> Array&lt;Location&gt; getTrailerLocations(ocpApimSubscriptionKey, trailerId, deviceId, from, to)

Returning Trailer Locations

Returns trailer locations using a GET request and search parameters.

### Example

```ts
import {
  Configuration,
  DevelopersApi,
} from '@pcs/location-api';
import type { GetTrailerLocationsRequest } from '@pcs/location-api';

async function example() {
  console.log("🚀 Testing @pcs/location-api SDK...");
  const api = new DevelopersApi();

  const body = {
    // string
    ocpApimSubscriptionKey: ocpApimSubscriptionKey_example,
    // number | The trailer Id. (optional)
    trailerId: 56,
    // number | The device Id. (optional)
    deviceId: 56,
    // string | Beginning of locations posting date range. (optional)
    from: from_example,
    // string | End of locations posting date range. (optional)
    to: to_example,
  } satisfies GetTrailerLocationsRequest;

  try {
    const data = await api.getTrailerLocations(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **ocpApimSubscriptionKey** | `string` |  | [Defaults to `undefined`] |
| **trailerId** | `number` | The trailer Id. | [Optional] [Defaults to `undefined`] |
| **deviceId** | `number` | The device Id. | [Optional] [Defaults to `undefined`] |
| **from** | `string` | Beginning of locations posting date range. | [Optional] [Defaults to `undefined`] |
| **to** | `string` | End of locations posting date range. | [Optional] [Defaults to `undefined`] |

### Return type

[**Array&lt;Location&gt;**](Location.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | The trailers location(s) was returned. |  -  |
| **400** | Bad input parameter. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getTruckLocation

> Location getTruckLocation(ocpApimSubscriptionKey, locationId)

Returning a Truck Location

Returning a truck location using a GET request.

### Example

```ts
import {
  Configuration,
  DevelopersApi,
} from '@pcs/location-api';
import type { GetTruckLocationRequest } from '@pcs/location-api';

async function example() {
  console.log("🚀 Testing @pcs/location-api SDK...");
  const api = new DevelopersApi();

  const body = {
    // string
    ocpApimSubscriptionKey: ocpApimSubscriptionKey_example,
    // number
    locationId: 56,
  } satisfies GetTruckLocationRequest;

  try {
    const data = await api.getTruckLocation(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **ocpApimSubscriptionKey** | `string` |  | [Defaults to `undefined`] |
| **locationId** | `number` |  | [Defaults to `undefined`] |

### Return type

[**Location**](Location.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | The truck location was returned. |  -  |
| **400** | Bad input parameter. |  -  |
| **404** | The record matching the location id was not found. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getTruckLocations

> Array&lt;Location&gt; getTruckLocations(ocpApimSubscriptionKey, truckId, from, to)

Returning Truck Locations

Returns truck locations using a GET request and search parameters.

### Example

```ts
import {
  Configuration,
  DevelopersApi,
} from '@pcs/location-api';
import type { GetTruckLocationsRequest } from '@pcs/location-api';

async function example() {
  console.log("🚀 Testing @pcs/location-api SDK...");
  const api = new DevelopersApi();

  const body = {
    // string
    ocpApimSubscriptionKey: ocpApimSubscriptionKey_example,
    // number | The truck Id. (optional)
    truckId: 56,
    // string | Beginning of locations posting date range. (optional)
    from: from_example,
    // string | End of locations posting date range. (optional)
    to: to_example,
  } satisfies GetTruckLocationsRequest;

  try {
    const data = await api.getTruckLocations(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **ocpApimSubscriptionKey** | `string` |  | [Defaults to `undefined`] |
| **truckId** | `number` | The truck Id. | [Optional] [Defaults to `undefined`] |
| **from** | `string` | Beginning of locations posting date range. | [Optional] [Defaults to `undefined`] |
| **to** | `string` | End of locations posting date range. | [Optional] [Defaults to `undefined`] |

### Return type

[**Array&lt;Location&gt;**](Location.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | The trucks location(s) was returned. |  -  |
| **400** | Bad input parameter. |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

