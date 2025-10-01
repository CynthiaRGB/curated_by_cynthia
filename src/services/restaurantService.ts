import { Restaurant, RestaurantData, City, RestaurantFilter, SearchQuery } from '../types/restaurant';
import restaurantData from '../data/google_enriched_restaurants_311_clean.json';

// Type assertion for the imported JSON data
const data = restaurantData as RestaurantData;

export class RestaurantService {
  private restaurants: Restaurant[] = data.places;

  /**
   * Get all restaurants
   */
  getAllRestaurants(): Restaurant[] {
    return this.restaurants;
  }

  /**
   * Get restaurants by city
   */
  getRestaurantsByCity(city: City): Restaurant[] {
    return this.restaurants.filter(restaurant => {
      const address = restaurant.google_data.formattedAddress.toLowerCase();
      const cityName = city.toLowerCase();
      
      // Check for city-specific patterns
      switch (city) {
        case "New York City":
          return address.includes('new york') || address.includes('nyc') || address.includes('brooklyn') || address.includes('manhattan');
        case "Tokyo":
          return address.includes('tokyo') || address.includes('japan');
        case "Seoul":
          return address.includes('seoul') || address.includes('korea');
        case "Paris":
          return address.includes('paris') || address.includes('france');
        default:
          return false;
      }
    });
  }

  /**
   * Filter restaurants based on criteria
   */
  filterRestaurants(filters: RestaurantFilter): Restaurant[] {
    let filtered = this.restaurants;

    if (filters.city) {
      filtered = this.getRestaurantsByCity(filters.city);
    }

    if (filters.cuisine) {
      const cuisine = filters.cuisine.toLowerCase();
      filtered = filtered.filter(restaurant => 
        restaurant.google_data.types.some(type => 
          type.toLowerCase().includes(cuisine)
        )
      );
    }

    if (filters.priceLevel) {
      filtered = filtered.filter(restaurant => 
        restaurant.google_data.priceLevel === filters.priceLevel
      );
    }

    if (filters.minRating !== undefined) {
      filtered = filtered.filter(restaurant => 
        (restaurant.google_data.rating || 0) >= filters.minRating!
      );
    }

    if (filters.maxRating !== undefined) {
      filtered = filtered.filter(restaurant => 
        (restaurant.google_data.rating || 5) <= filters.maxRating!
      );
    }

    if (filters.isOpenNow !== undefined) {
      filtered = filtered.filter(restaurant => {
        const hours = restaurant.google_data.regularOpeningHours;
        if (!hours) return true; // If no hours data, include it
        return hours.openNow === filters.isOpenNow;
      });
    }

    return filtered;
  }

  /**
   * Search restaurants by text query
   */
  searchRestaurants(query: SearchQuery): Restaurant[] {
    let results = this.restaurants;

    // Apply city filter first if specified
    if (query.city) {
      results = this.getRestaurantsByCity(query.city);
    }

    // Apply additional filters if provided
    if (query.filters) {
      results = this.filterRestaurants(query.filters);
    }

    // Text search
    if (query.text.trim()) {
      const searchTerms = query.text.toLowerCase().split(' ');
      results = results.filter(restaurant => {
        const searchableText = [
          restaurant.google_data.displayName.text,
          restaurant.google_data.formattedAddress,
          ...restaurant.google_data.types,
          restaurant.google_data.nationalPhoneNumber || '',
          restaurant.original_place.properties.location.name
        ].join(' ').toLowerCase();

        return searchTerms.every(term => searchableText.includes(term));
      });
    }

    return results;
  }

  /**
   * Get restaurant by ID
   */
  getRestaurantById(placeId: string): Restaurant | undefined {
    return this.restaurants.find(restaurant => restaurant.google_place_id === placeId);
  }

  /**
   * Get unique cuisine types across all restaurants
   */
  getCuisineTypes(): string[] {
    const types = new Set<string>();
    this.restaurants.forEach(restaurant => {
      restaurant.google_data.types.forEach(type => {
        // Filter out non-cuisine types
        if (!['point_of_interest', 'establishment', 'store', 'food'].includes(type)) {
          types.add(type);
        }
      });
    });
    return Array.from(types).sort();
  }

  /**
   * Get statistics about the restaurant data
   */
  getStatistics() {
    const cities = {
      'New York City': this.getRestaurantsByCity('New York City').length,
      'Tokyo': this.getRestaurantsByCity('Tokyo').length,
      'Seoul': this.getRestaurantsByCity('Seoul').length,
      'Paris': this.getRestaurantsByCity('Paris').length,
    };

    const totalRestaurants = this.restaurants.length;
    const averageRating = this.restaurants
      .filter(r => r.google_data.rating)
      .reduce((sum, r) => sum + (r.google_data.rating || 0), 0) / 
      this.restaurants.filter(r => r.google_data.rating).length;

    return {
      totalRestaurants,
      cities,
      averageRating: Math.round(averageRating * 10) / 10,
      cuisineTypes: this.getCuisineTypes().length
    };
  }
}

// Export a singleton instance
export const restaurantService = new RestaurantService();
