# HealthResponseCache

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**HitRate** | Pointer to **float32** |  | [optional] 
**ItemsCached** | Pointer to **int32** |  | [optional] 

## Methods

### NewHealthResponseCache

`func NewHealthResponseCache() *HealthResponseCache`

NewHealthResponseCache instantiates a new HealthResponseCache object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewHealthResponseCacheWithDefaults

`func NewHealthResponseCacheWithDefaults() *HealthResponseCache`

NewHealthResponseCacheWithDefaults instantiates a new HealthResponseCache object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetHitRate

`func (o *HealthResponseCache) GetHitRate() float32`

GetHitRate returns the HitRate field if non-nil, zero value otherwise.

### GetHitRateOk

`func (o *HealthResponseCache) GetHitRateOk() (*float32, bool)`

GetHitRateOk returns a tuple with the HitRate field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetHitRate

`func (o *HealthResponseCache) SetHitRate(v float32)`

SetHitRate sets HitRate field to given value.

### HasHitRate

`func (o *HealthResponseCache) HasHitRate() bool`

HasHitRate returns a boolean if a field has been set.

### GetItemsCached

`func (o *HealthResponseCache) GetItemsCached() int32`

GetItemsCached returns the ItemsCached field if non-nil, zero value otherwise.

### GetItemsCachedOk

`func (o *HealthResponseCache) GetItemsCachedOk() (*int32, bool)`

GetItemsCachedOk returns a tuple with the ItemsCached field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetItemsCached

`func (o *HealthResponseCache) SetItemsCached(v int32)`

SetItemsCached sets ItemsCached field to given value.

### HasItemsCached

`func (o *HealthResponseCache) HasItemsCached() bool`

HasItemsCached returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


