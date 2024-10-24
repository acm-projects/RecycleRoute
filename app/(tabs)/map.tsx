import React, { useState, useEffect, useCallback, useRef } from 'react';
import MapView, { Marker, Region } from 'react-native-maps';
import { StyleSheet, View, Modal, Text, TouchableOpacity, Linking, Platform, ActivityIndicator, ScrollView, TextInput } from 'react-native';
import * as Location from 'expo-location';
import axios from 'axios';
import { Feather } from '@expo/vector-icons';
import {useRoute, RouteProp} from '@react-navigation/native';

interface RecyclingCenter {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  openingHours?: { open_now: boolean; weekday_text: string[] }; 
  rating?: number; 
  description?: string; 
}

type RootStackParamList = {
  map: { itemName: string }; // Define the route and its expected params
};

const defaultKeyword = 'recycling center|waste management|recyclable materials|recycle center';

// Define a type for the route prop of the 'map' screen
type MapScreenRouteProp = RouteProp<RootStackParamList, 'map'>;

export default function Map() {
  const [region, setRegion] = useState<Region | null>(null);
  const [recyclingCenters, setRecyclingCenters] = useState<RecyclingCenter[]>([]);
  const [selectedCenter, setSelectedCenter] = useState<RecyclingCenter | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [currentSearchKeyword, setCurrentSearchKeyword] = useState('');

  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const route = useRoute<MapScreenRouteProp>();
  const { itemName = '' } = route.params || {};
  const [prevItemName, setPrevItemName] = useState(itemName);

  const GOOGLE_PLACES_API_KEY = process.env.EXPO_PUBLIC_CLOUD_VISION_API_KEY;

  const isInitialRender = useRef(true);


  const requestLocationPermission = async (): Promise<boolean> => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.log('Permission to access location was denied');
      return false;
    }
    return true;
  };
  
  useEffect(() => {
    const handleItemNameChange = async () => {
      if (itemName && (itemName !== prevItemName || isInitialRender.current)) {
        console.log('Updating search with itemName:', itemName); // Debug log
        setSearchKeyword(itemName);
        setCurrentSearchKeyword(itemName);
        setPrevItemName(itemName);
        
        // If we have the region, trigger a new search
        if (region) {
          await fetchRecyclingCenters(region.latitude, region.longitude, itemName);
        }
        
        isInitialRender.current = false;
      }
    };

    handleItemNameChange();
  }, [itemName, region]);

  useEffect(() => {
    const fetchLocationAndCenters = async () => {
      const hasPermission = await requestLocationPermission();
      if (!hasPermission) return;

      let location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = location.coords;
      setRegion({
        latitude,
        longitude,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      });

      fetchRecyclingCenters(latitude, longitude);
    };

    fetchLocationAndCenters();
  }, []);

  

  const fetchRecyclingCenters = useCallback(async (lat: number, lng: number, keyword: string = '') => {
    setLoading(true);
    
    // Use trimmed keyword to check if it's really empty
    const trimmedKeyword = keyword.trim();
    const searchKeyword = trimmedKeyword ? 
      `${trimmedKeyword} recycling` : 
      defaultKeyword;
    
    console.log('Searching with keyword:', searchKeyword); // Debug log

    try {
      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/place/nearbysearch/json',
        {
          params: {
            location: `${lat},${lng}`,
            radius: 80467,
            keyword: searchKeyword,
            key: GOOGLE_PLACES_API_KEY,
          },
        }
      );

      const centers = response.data.results.map((place: any) => ({
        id: place.place_id,
        name: place.name,
        latitude: place.geometry.location.lat,
        longitude: place.geometry.location.lng,
        address: place.vicinity || 'Address not available',
      }));

      setRecyclingCenters(centers);
      centers.forEach((center: RecyclingCenter) => fetchPlaceDetails(center.id));
    } catch (error) {
      console.error("Error fetching recycling centers:", error);
    } finally {
      setLoading(false);
    }
  }, [GOOGLE_PLACES_API_KEY]);


  const fetchPlaceDetails = async (placeId: string) => {
    try {
      const response = await axios.get(
        `https://maps.googleapis.com/maps/api/place/details/json`,
        {
          params: {
            place_id: placeId,
            key: GOOGLE_PLACES_API_KEY,
          },
        }
      );
  
      const placeDetails = response.data.result;
  
      let topReview = 'No reviews available.';
      if (placeDetails.reviews && placeDetails.reviews.length > 0) {
        topReview = placeDetails.reviews[0].text;
      }
  
      setRecyclingCenters(prevCenters =>
        prevCenters.map(center =>
          center.id === placeId
            ? {
                ...center,
                openingHours: placeDetails.opening_hours,
                rating: placeDetails.rating,
                description: topReview || 'No reviews available.',
              }
            : center
        )
      );
    } catch (error) {
      console.error("Error fetching place details:", error);
    }
  };

  const handleMarkerPress = (center: RecyclingCenter) => {
    setSelectedCenter(center);
    setModalVisible(true);
    setIsExpanded(false);
  };

  const openMaps = (center: RecyclingCenter) => {
    const latLng = `${center.latitude},${center.longitude}`;
    const url = Platform.select({
      ios: `maps:0,0?q=${latLng}(${center.name})`,
      android: `geo:0,0?q=${latLng}(${center.name})`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${latLng}`,
    });

    Linking.openURL(url).catch((err) => console.error("Failed to open maps:", err));
    setModalVisible(false);
  };

  // Function to toggle the description view
  const toggleDescription = () => {
    setIsExpanded(!isExpanded);
  };

  useEffect(() => {
    if (region && currentSearchKeyword !== '') {
      fetchRecyclingCenters(region.latitude, region.longitude, currentSearchKeyword);
    }
  }, [region, currentSearchKeyword, fetchRecyclingCenters]);

  useEffect(() => {
    if (itemName !== '' && itemName !== prevItemName) {
      setSearchKeyword(itemName);
      setCurrentSearchKeyword(itemName);
      setPrevItemName(itemName);
    }
  }, [itemName]);

  const handleSearch = useCallback(() => {
    if (region) {
      setCurrentSearchKeyword(searchKeyword);
      fetchRecyclingCenters(region.latitude, region.longitude, searchKeyword);
    }
    setSearchModalVisible(false);
  }, [region, searchKeyword, fetchRecyclingCenters]);

  // Update clearSearch to properly reset everything
  const clearSearch = useCallback(() => {
    setSearchKeyword('');
    setCurrentSearchKeyword('');
    setPrevItemName('');
    if (region) {
      fetchRecyclingCenters(region.latitude, region.longitude, '');
    }
  }, [region, fetchRecyclingCenters]);
  

  const handleCloseSearchModal = () => {
    if (searchKeyword === '') {
      clearSearch();
    }
    setSearchModalVisible(false);
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color="beige" style={styles.loadingIndicator} />
      ) : (
        <>
        {region && (
          <MapView
            style={styles.map}
            region={region}
            showsUserLocation={true}
            showsMyLocationButton={true}
          >
            {recyclingCenters.map((center) => (
              <Marker
                key={center.id}
                coordinate={{ latitude: center.latitude, longitude: center.longitude }}
                title={center.name}
                onPress={() => handleMarkerPress(center)}
                pinColor="#C2D5BA"
              />
            ))}
          </MapView>)}
          {/* Button for filters */}
      <TouchableOpacity 
      style={[styles.filterButton, { position: 'absolute', top: 50, left: 30, zIndex: 1 }]}    
      onPress={() => setFilterModalVisible(true)}
    >
      <Text style={styles.buttonText}>Filters</Text>
    </TouchableOpacity>

    {/* Search icon */}
    <TouchableOpacity 
      style={{ position: 'absolute', top: 50, right: 30, zIndex: 1 }}
      onPress={() => setSearchModalVisible(true)}
    >
      <Feather name="search" size={24} color="black" />
    </TouchableOpacity>

    {/* Modal for filters */}
    <Modal
      visible={filterModalVisible}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setFilterModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>Filter Options</Text>
          {/* Add filter options here */}
          <TouchableOpacity onPress={() => setFilterModalVisible(false)} style={styles.button}>
            <Text style={styles.buttonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    </>
        )
      }
  
      {/* Modal for search */}
      <Modal
        visible={searchModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={handleCloseSearchModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Item to Recycle</Text>
            <TextInput
              style={{
                height: 40,
                borderColor: 'gray',
                borderWidth: 1,
                marginBottom: 20,
                paddingHorizontal: 10,
                width: '100%',
              }}
              onChangeText={setSearchKeyword}
              value={searchKeyword}
              placeholder="Enter keyword"
            />
            <TouchableOpacity onPress={handleSearch} style={styles.button}>
              <Text style={styles.buttonText}>Search</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={clearSearch} style={styles.button}>
              <Text style={styles.buttonText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleCloseSearchModal} style={styles.button}>
              <Text style={styles.buttonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
  
      {/* Modal for the recycling locations */}
      {selectedCenter && (
        <Modal
          animationType="slide"
          transparent={true}
          visible={modalVisible}
          onRequestClose={() => {
            setModalVisible(!modalVisible);
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <Text style={styles.modalTitle}>{selectedCenter.name}</Text>
              <Text style={styles.modalAddress}>{selectedCenter.address}</Text>
              
              {selectedCenter.openingHours && (
                <View style={styles.openingHoursContainer}>
                  <Text style={styles.modalText}>
                    {selectedCenter.openingHours.open_now ? "Open Now" : "Closed"}
                  </Text>
                  <Text style={styles.modalTextSmall}>Hours of Operation:</Text>
                  {selectedCenter.openingHours.weekday_text.map((timing, index) => (
                    <Text key={index} style={styles.modalTextSmall}>{timing}</Text>
                  ))}
                </View>
              )}
              
              {selectedCenter.rating && (
                <Text style={styles.modalText}>
                  Rating: {selectedCenter.rating} ⭐
                </Text>
              )}
              <ScrollView style={styles.scrollView} scrollEnabled={isExpanded}>
                <Text style={styles.modalDescription}>
                  <Text style={{ fontWeight: 'bold' }}>Customer Stated: </Text>
                  <Text style={{ fontStyle: 'italic' }}>
                    {isExpanded 
                      ? selectedCenter.description 
                      : (selectedCenter.description && selectedCenter.description.split(" ").length > 20 
                        ? selectedCenter.description.split(" ").slice(0, 20).join(" ") + "..." 
                        : selectedCenter.description)}
                  </Text>
                </Text>
              </ScrollView>
              <TouchableOpacity onPress={toggleDescription}>
                <Text style={styles.toggleText}>
                  {isExpanded ? "Show Less" : "Show More"}
                </Text>
              </TouchableOpacity>
  
              <TouchableOpacity 
                style={styles.button}
                onPress={() => openMaps(selectedCenter)}
              >
                <Text style={styles.buttonText}>Get Directions</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.button}
                onPress={() => setModalVisible(false)} 
              >
                <Text style={styles.buttonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  loadingIndicator: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: {
    width: '80%',
    padding: 20,
    backgroundColor: 'beige',
    borderRadius: 10,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  modalAddress: {
    marginVertical: 10,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  modalText: {
    marginVertical: 5,
    textAlign: 'center',
  },
  modalTextSmall: {
    marginVertical: 2,
    textAlign: 'center',
    fontSize: 12,
  },
  openingHoursContainer: {
    marginVertical: 10,
  },
  scrollView: {
    maxHeight: 175,
  },
  modalDescription: {
    marginVertical: 10,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#C2D5BA',
    padding: 10,
    borderRadius: 5,
    marginVertical: 5,
    width: '100%',
  },
  buttonText: {
    color: 'white',
    textAlign: 'center',
  },
  toggleText: {
    color: '#728A68',
    textAlign: 'center',
    marginVertical: 10,
    fontWeight: 'bold',
  },
  //Beginning Modal for filter and 
   filterContainer: {
    width: '80%',
    padding: 20,
    backgroundColor: 'beige',
    borderRadius: 10,
    alignItems: 'center',
  },
  filterTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  filterAddress: {
    marginVertical: 10,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  filterText: {
    marginVertical: 5,
    textAlign: 'center',
  },
  filterButton: {
    backgroundColor: '#C2D5BA',
    padding: 10,
    borderRadius: 5,
    marginVertical: 5,
    width: '30%',
  },
});