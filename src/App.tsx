import { useState, useEffect } from 'react'
import { restaurantService } from './services/restaurantService'
import { Restaurant } from './types/restaurant'
import './App.css'

function App() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [stats, setStats] = useState<any>(null)

  useEffect(() => {
    // Load restaurant data
    const allRestaurants = restaurantService.getAllRestaurants()
    setRestaurants(allRestaurants.slice(0, 5)) // Show first 5 restaurants
    
    // Load statistics
    const statistics = restaurantService.getStatistics()
    setStats(statistics)
  }, [])

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white p-8 rounded-lg shadow-lg mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            Curated by Cynthia
          </h1>
          <p className="text-gray-600 mb-6">
            Your personal restaurant recommendation assistant
          </p>
          
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-semibold text-blue-800">Total Restaurants</h3>
                <p className="text-2xl font-bold text-blue-600">{stats.totalRestaurants}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <h3 className="font-semibold text-green-800">Average Rating</h3>
                <p className="text-2xl font-bold text-green-600">{stats.averageRating}/5</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <h3 className="font-semibold text-purple-800">Cuisine Types</h3>
                <p className="text-2xl font-bold text-purple-600">{stats.cuisineTypes}</p>
              </div>
              <div className="bg-orange-50 p-4 rounded-lg">
                <h3 className="font-semibold text-orange-800">Cities</h3>
                <p className="text-2xl font-bold text-orange-600">4</p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white p-8 rounded-lg shadow-lg">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Sample Restaurants</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {restaurants.map((restaurant) => (
              <div key={restaurant.google_place_id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                <a 
                  href={restaurant.original_place.properties.google_maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block hover:bg-gray-50 rounded-lg p-2 -m-2 transition-colors"
                >
                  <h3 className="font-bold text-lg text-gray-800 mb-2 hover:text-blue-600 transition-colors">
                    {restaurant.google_data.displayName.text}
                  </h3>
                  <p className="text-gray-600 text-sm mb-2">
                    {restaurant.google_data.formattedAddress}
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <span className="text-yellow-500">★</span>
                      <span className="ml-1 font-semibold">
                        {restaurant.google_data.rating || 'N/A'}
                      </span>
                      <span className="text-gray-500 text-sm ml-1">
                        ({restaurant.google_data.userRatingCount || 0} reviews)
                      </span>
                    </div>
                    <div className="text-sm text-gray-500">
                      {restaurant.google_data.types.slice(0, 2).join(', ')}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center text-blue-600 text-sm">
                    <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                    </svg>
                    View on Google Maps
                  </div>
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
