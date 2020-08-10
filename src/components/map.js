import mapConfig from '@/config/map.js'

class Map {
  constructor (options) {
    /* PUBLIC PROPERTIES DESCRIPTION */
    this.map = null
    this.drawLayer = null
    this.selectedPolygon = null
    this.selectedMarkerIndex = null
    this.drawingMode = false

    const { container, ...rest } = options

    if (container && container.nodeType === 1) this.container = container
    else this.container = document.body.appendChild(document.createElement('div'))

    this.storage.constructor.prototype.eventHandler = this.container

    this.createMap()

    for (const option in rest) {
      this.options[option] = rest[option]
    }
    this.center = this.options.center
    this.markerIcon = {
      strokeColor: '#FF00FF',
      strokeOpacity: 1,
      fillColor: '#FF00FF',
      fillOpacity: 1,
      scale: 4
    }
    this.markerIconActive = {
      path: 'M -1 -1 L 1 -1 L 1 1 L -1 1 z',
      strokeColor: '#FFFF00',
      strokeOpacity: 1,
      fillColor: '#FFAA00',
      fillOpacity: 1,
      scale: 4
    }

    this.map = this.container.appendChild(document.createElement('div'))
    this.setMapSize()
  }

  showMarker (event) {
    this.hideAllMarkers()
    if (!this.selectedPolygon || !event.markerIndex) return
    this.selectedMarkerIndex = event.markerIndex
    this.selectedPolygonMarkers[event.markerIndex].setIcon(this.markerIconActive)
  }

  hideAllMarkers (event) {
    if (!this.selectedPolygon) return
    this.selectedPolygonMarkers.forEach(marker => marker.setIcon(this.markerIcon))
  }

  changeMarkerPosition (markerCoordinates) {
    if (!this.selectedPolygon || typeof this.selectedMarkerIndex !== 'number' || !markerCoordinates) return

    const latLng = new this.__geo.LatLng(markerCoordinates[1], markerCoordinates[0])

    this.selectedPolygonMarkers[this.selectedMarkerIndex].setPosition(latLng)
    this.selectedPolygon.getPath().setAt(this.selectedMarkerIndex, latLng)
  }

  resetSelectedPolygon () {
    this.selectedPolygon.setOptions({
      fillColor: this.options.colors[this.selectedPolygon.type],
      strokeColor: this.options.colors[this.selectedPolygon.type]
    })

    this.selectedPolygonMarkers.forEach((marker, index) => {
      this.__geo.event.clearListeners(marker, 'drag')
      marker.setMap(null)
    })

    this.selectedPolygonMarkers = null
  }

  findPolygon (type, latLng) {
    return this[type].find(polygon => this.__geoLocation(latLng, polygon))
  }

  setSelectedPolygon (latLng) {
    this.selectedPolygon = this.findPolygon('ServiceAvailable', latLng) ||
      this.findPolygon('BuildCommenced', latLng) ||
      this.findPolygon('ComingSoon', latLng) || null
    if (this.selectedPolygon) {
      this.selectedPolygon.setOptions({
        fillColor: '#f0f',
        strokeColor: '#f0f'
      })
      this.createMarkers()
      this.container.dispatchEvent(Object.assign(new Event('polygon-selected'), {
        polygonId: this.selectedPolygon.id
      }))
    }
    return !!this.selectedPolygon
  }

  clickEventHandler (event) {
    this.map.setCenter(event.latLng)
    if (this.selectedPolygon) this.resetSelectedPolygon()
    if (this.setSelectedPolygon(event.latLng)) return
    this.container.dispatchEvent(Object.assign(new Event('empty-field-click'), {
      pointOnMap: [event.latLng.lat(), event.latLng.lng()],
      clickedAt: [event.clientX, event.clientY]
    }))
  }

  async createMap () {
    if (!await this.loadScript()) return console.error('Error accessing Google Maps API')
    Map.prototype.__geo = window.google.maps
    Map.prototype.Polygon = window.google.maps.Polygon
    Map.prototype.__places = window.google.maps.places
    Map.prototype.__geoCoder = new window.google.maps.Geocoder()
    Map.prototype.Autocomplete = window.google.maps.places.Autocomplete
    Map.prototype.__geoLocation = window.google.maps.geometry.poly.containsLocation

    this.map = new this.__geo.Map(this.map, {
      center: this.center,
      zoom: 13,
      styles: mapConfig,
      disableDefaultUI: true
    })

    this.markerIcon.path = this.__geo.SymbolPath.CIRCLE

    this.__geo.event.addListener(this.map, 'click', this.clickEventHandler.bind(this))

    this.buildPolygons()
  }

  createMarkers () {
    if (this.selectedPolygonMarkers) {
      this.selectedPolygonMarkers.forEach(marker => marker.setOptions({ map: null }))
    }
    this.selectedPolygonMarkers = []
    const coordinates = this.storage.getFeatureById(this.selectedPolygon.id).coordinates
    coordinates.forEach((point, index) => {
      const marker = new this.__geo.Marker({
        map: this.map,
        position: new this.__geo.LatLng(point[1], point[0]),
        icon: this.markerIcon,
        draggable: true,
        raiseOnDrag: false,
        title: `${index}`
      })
      marker.addListener('dragend', this.changePolygonMarkerPosition(index))
      this.selectedPolygonMarkers.push(marker)
    })
  }

  changePolygonType (event) {
    ['ServiceAvailable', 'BuildCommenced', 'ComingSoon'].forEach((item) => {
      this[item].forEach(polygon => {
        polygon.setMap(null)
        polygon = null
      })
      this[item] = []
    })
    this.buildPolygons()
  }

  changePolygonMarkerPosition (markerIndex) {
    return function (event) {
      this.selectedPolygon.getPath().setAt(markerIndex, event.latLng)
      localStorage.updateMarkerPosition(this.selectedPolygon.id, markerIndex, [event.latLng.lng(), event.latLng.lat()])
    }.bind(this)
  }

  changeMarkerCoordinates (event) {
    const latLng = new this.__geo.LatLng(event.details.markerCoordinates[1], event.details.markerCoordinates[0])
    this.selectedPolygon.getPath().setAt(event.details.markerIndex, latLng)
    this.selectedPolygonMarkers[event.details.markerIndex].setPosition(latLng)
  }

  setMapSize () {
    const box = this.container.getBoundingClientRect
    this.height = box && box.height ? box.height : typeof this.options.height === 'number' ? this.options.height : 400
    // this.width = box && box.width ? box.width : typeof this.options.width === 'number' ? this.options.width : window.innerWidth
    this.mapHeight = this.height + 'px'
    // this.mapWidth = this.width ? this.width + 'px' : '100%'
    this.mapWidth = '100%'
    this.map.style = `
      height: ${this.mapHeight};
      width: ${this.mapWidth};
    `
  }

  setColors (ServiceAvailable = '#A00E0D', BuildCommenced = '#000000', ComingSoon = '#FFFF00') {
    this.colors = { ServiceAvailable, BuildCommenced, ComingSoon }
  }

  updateSelectedPolygonPath (coordinates) {
    this.selectedPolygon.setPath(coordinates.map(item => ({ lat: item[1], lng: item[0] })))
  }

  buildPolygon (feature, type) {
    const color = this.options.colors[type]
    const polygon = Object.assign(new this.__geo.Polygon({
      paths: feature.coordinates.map(point => ({ lat: point[1], lng: point[0] })),
      fillColor: color,
      strokeColor: color,
      strokeWeight: 0.5,
      clickable: false
    }), { type, id: feature.id })
    polygon.setMap(this.map)
    return polygon
  }

  buildPolygons () {
    for (const type of ['ServiceAvailable', 'BuildCommenced', 'ComingSoon']) {
      const features = localStorage.getFeaturesByType(type)
      const polygons = features.map(feature => this.buildPolygon(feature, type))
      this[type] = polygons
    }
  }

  createDrawLayer () {
    this.drawLayer = new this.__geo.Data({ map: this.map })
    this.drawLayer.setControls(['Polygon'])
    this.drawLayer.setStyle({
      editable: true,
      draggable: true,
      fillColor: '#f0f',
      strokeColor: '#f0f'
    })

    const self = this

    this.drawLayer.addListener('addfeature', function (event) {
      const featureId = Date.now().toString()
      event.feature.setProperty('id', featureId)
      event.feature.setProperty('typeOf', 'ComingSoon')
      this.toGeoJson(function (json) {
        json.features.forEach((feature) => {
          localStorage.addFeature(featureId, feature)
          self.ComingSoon.push(self.buildPolygon(localStorage.getFeatureById(featureId), 'ComingSoon'))
        })
        self.drawLayer.setMap(null)
        delete self.drawLayer
        self.drawingMode = false
        self.container.dispatchEvent(new Event('drawing-mode-off'))
      })
    })
  }

  switchToDrawingMode () {
    this.drawingMode = true
    this.container.dispatchEvent(new Event('drawing-mode-on'))
    if (!this.drawLayer) this.createDrawLayer()
    if (this.drawLayer.getMap()) return
    this.drawLayer.setMap(this.map)
  }

  removePolygon (type, id) {
    this.resetSelectedPolygon()
    const index = this[type].findIndex(polygon => polygon.id === id)
    this[type][index].setMap(null)
    this[type].splice(index, 1)
    this.selectedPolygon = null
  }

  loadScript () {
    return new Promise((resolve) => {
      const script = document.body.appendChild(document.createElement('script'))
      script.src = 'https://maps.googleapis.com/maps/api/js?key=AIzaSyBVql75Qc_Y5oGvrxdcNRNMhBlZEzTdk1o&libraries=geometry,drawing,places'
      script.onload = resolve.bind(null, true)
      script.onerror = resolve.bind(null, false)
    })
  }
}

Map.prototype.storage = localStorage

Map.prototype.options = {
  container: document.body,
  height: '700px',
  width: '100%',
  center: { lat: -37.87013628, lng: 144.963058 },
  colors: {
    ServiceAvailable: '#A00E0D',
    BuildCommenced: '#000000',
    ComingSoon: '#FFBB00'
  }
}

export default Map
