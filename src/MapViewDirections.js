import React, { Component } from 'react';
import PropTypes from 'prop-types';
import MapView from 'react-native-maps';
import isEqual from 'lodash.isequal';

const WAYPOINT_LIMIT = 10;

class MapViewDirections extends Component {

	constructor(props) {
		super(props);

		this.state = {
			coordinates: null,
			distance: null,
			duration: null,
        };
	}

	componentDidMount() {
		this.fetchAndRenderRoute(this.props);
	}

	componentDidUpdate(prevProps) {
		if (!isEqual(prevProps.origin, this.props.origin) || !isEqual(prevProps.destination, this.props.destination) || !isEqual(prevProps.waypoints, this.props.waypoints) || !isEqual(prevProps.mode, this.props.mode) || !isEqual(prevProps.precision, this.props.precision) || !isEqual(prevProps.splitWaypoints, this.props.splitWaypoints)) {
			if (this.props.resetOnChange === false) {
				this.fetchAndRenderRoute(this.props);
			} else {
				this.resetState(() => {
					this.fetchAndRenderRoute(this.props);
				});
			}
		}
	}

	resetState = (cb = null) => {
		this.setState({
			coordinates: null,
			distance: null,
			duration: null,
		}, cb);
	}

	decode(t, e) {
		for (var n, o, u = 0, l = 0, r = 0, d = [], h = 0, i = 0, a = null, c = Math.pow(10, e || 5); u < t.length;) {
			a = null, h = 0, i = 0;
			do a = t.charCodeAt(u++) - 63, i |= (31 & a) << h, h += 5; while (a >= 32);
			n = 1 & i ? ~(i >> 1) : i >> 1, h = i = 0;
			do a = t.charCodeAt(u++) - 63, i |= (31 & a) << h, h += 5; while (a >= 32);
			o = 1 & i ? ~(i >> 1) : i >> 1, l += n, r += o, d.push([l / c, r / c]);
		}

		return d = d.map(function(t) {
			return {
				latitude: t[0],
				longitude: t[1],
			};
		});
	}

	fetchAndRenderRoute = (props) => {

		let {
			origin: initialOrigin,
			destination: initialDestination,
			waypoints: initialWaypoints,
			apikey,
			onStart,
			onReady,
			onError,
			mode = 'DRIVING',
			language = 'en',
			optimizeWaypoints,
			directionsServiceBaseUrl,
			splitWaypoints,
			region,
			precision = 'low',
		} = props;

		if (!initialOrigin || !initialDestination) {
			return;
		}

		// Routes array which we'll be filling.
		// We'll perform a Directions API Request for reach route
		const routes = [];

		// We need to split the waypoints in chunks, in order to not exceede the max waypoint limit
		// ~> Chunk up the waypoints, yielding multiple routes
		if (splitWaypoints && initialWaypoints && initialWaypoints.length > WAYPOINT_LIMIT) {
			// Split up waypoints in chunks with chunksize WAYPOINT_LIMIT
			const chunckedWaypoints = initialWaypoints.reduce((accumulator, waypoint, index) => {
				const numChunk = Math.floor(index / WAYPOINT_LIMIT);
				accumulator[numChunk] = [].concat((accumulator[numChunk] || []), waypoint);
				return accumulator;
			}, []);

			// Create routes for each chunk, using:
			// - Endpoints of previous chunks as startpoints for the route (except for the first chunk, which uses initialOrigin)
			// - Startpoints of next chunks as endpoints for the route (except for the last chunk, which uses initialDestination)
			for (let i = 0; i < chunckedWaypoints.length; i++) {
				routes.push({
					waypoints: chunckedWaypoints[i],
					origin: (i === 0) ? initialOrigin : chunckedWaypoints[i-1][chunckedWaypoints[i-1].length - 1],
					destination: (i === chunckedWaypoints.length - 1) ? initialDestination : chunckedWaypoints[i+1][0],
				});
			}
		}

		// No splitting of the waypoints is requested/needed.
		// ~> Use one single route
		else {
			routes.push({
				waypoints: initialWaypoints,
				origin: initialOrigin,
				destination: initialDestination,
			});
        }

		// Perform a Directions API Request for each route
		Promise.all(routes.map((route, index) => {
			let {
				origin,
                destination,
                // waypoints
            } = route;
            const waypoints = []
			if (origin.latitude && origin.longitude) {
				origin = `${origin.latitude},${origin.longitude}`;
			}

			if (destination.latitude && destination.longitude) {
				destination = `${destination.latitude},${destination.longitude}`;
            }

			// waypoints = waypoints
			// 	.map(waypoint => (waypoint.latitude && waypoint.longitude) ? `${waypoint.latitude},${waypoint.longitude}` : waypoint)
			// 	.join('|');

			// if (optimizeWaypoints) {
			// 	waypoints = `optimize:true|${waypoints}`;
			// }

			if (index === 0) {
				onStart && onStart({
					origin,
					destination,
					// waypoints: initialWaypoints,
				});
			}

			return (
				this.fetchRoute(directionsServiceBaseUrl, origin, waypoints, destination, apikey, mode, language, region, precision)
					.then(result => {
						return result;
					})
					.catch(errorMessage => {
						this.resetState();
						console.warn(`MapViewDirections Error: ${errorMessage}`); // eslint-disable-line no-console
						onError && onError(errorMessage);
					})
			);
		})).then(results => {
            // Combine all Directions API Request results into one
			const result = results.reduce((acc, { distance, duration, coordinates, fare }) => {
				acc.coordinates = [
					...acc.coordinates,
					...coordinates,
				];
				acc.distance += distance;
				acc.duration += duration;
				acc.fares = [
					...acc.fares,
					fare,
				];

				return acc;
			}, {
				coordinates: [],
				distance: 0,
				duration: 0,
				fares: [],
			});

			// Plot it out and call the onReady callback
			this.setState({
				coordinates: result.coordinates,
			}, function() {
				if (onReady) {
					onReady(result);
				}
			});
		});
	}

	fetchRoute(directionsServiceBaseUrl, origin, waypoints, destination, apikey, mode, language, region) {
		let latLonStartPair = origin.split(',')
		let startLat = latLonStartPair[0]
		let startLon = latLonStartPair[1]

		let latLonEndPair = destination.split(",")
		let endLat = latLonEndPair[0]
		let endLon = latLonEndPair[1]

		// Define the URL to call. Only add default parameters to the URL if it's a string.
		let url = directionsServiceBaseUrl;
		if (typeof (directionsServiceBaseUrl) === 'string') {
			url += `?startLat=${startLat}&startLon=${startLon}&endLat=${endLat}&endLon=${endLon}`;
        }

		return fetch(url, { headers: { "Authorization": apikey } })
			.then(response => response.json())
			.then(json => {
				if (json.status !== 'OK') {
					const errorMessage = json.error_message || json.status || 'Unknown error';
					return Promise.reject(errorMessage);
				}

				if (json.routes.length) {
                    const route = json.routes[0];
					return Promise.resolve({
						distance: route.legs.reduce((carry, curr) => {
							return carry + curr.distance.value;
						}, 0) / 1000,
						duration: route.legs.reduce((carry, curr) => {
							return carry + curr.duration_in_traffic ? curr.duration_in_traffic.value:curr.duration.value;
						}, 0) / 60,
						coordinates: this.decode(route.overview_polyline.points),
						// fare: route.fare,
					});

				} else {
                    console.log("REJECT")
					return Promise.reject();
				}
			})
			.catch(err => {
				console.warn('react-native-maps-directions Error on GMAPS route request', err);  // eslint-disable-line no-console
			});
	}

	render() {
		const { coordinates } = this.state;

		if (!coordinates) {
			return null;
		}

		const {
			origin, // eslint-disable-line no-unused-vars
			waypoints, // eslint-disable-line no-unused-vars
			splitWaypoints, // eslint-disable-line no-unused-vars
			destination, // eslint-disable-line no-unused-vars
			apikey, // eslint-disable-line no-unused-vars
			onReady, // eslint-disable-line no-unused-vars
			onError, // eslint-disable-line no-unused-vars
			mode, // eslint-disable-line no-unused-vars
			language, // eslint-disable-line no-unused-vars
			region, // eslint-disable-line no-unused-vars
			precision,  // eslint-disable-line no-unused-vars
			...props
		} = this.props;

		return (
			<MapView.Polyline coordinates={coordinates} {...props} />
		);
	}

}

MapViewDirections.propTypes = {
	origin: PropTypes.oneOfType([
		PropTypes.string,
		PropTypes.shape({
			latitude: PropTypes.number.isRequired,
			longitude: PropTypes.number.isRequired,
		}),
	]),
	waypoints: PropTypes.arrayOf(
		PropTypes.oneOfType([
			PropTypes.string,
			PropTypes.shape({
				latitude: PropTypes.number.isRequired,
				longitude: PropTypes.number.isRequired,
			}),
		]),
	),
	destination: PropTypes.oneOfType([
		PropTypes.string,
		PropTypes.shape({
			latitude: PropTypes.number.isRequired,
			longitude: PropTypes.number.isRequired,
		}),
	]),
	apikey: PropTypes.string.isRequired,
	onStart: PropTypes.func,
	onReady: PropTypes.func,
	onError: PropTypes.func,
	mode: PropTypes.oneOf(['DRIVING', 'BICYCLING', 'TRANSIT', 'WALKING']),
	language: PropTypes.string,
	resetOnChange: PropTypes.bool,
	optimizeWaypoints: PropTypes.bool,
	directionsServiceBaseUrl: PropTypes.string.isRequired,
	splitWaypoints: PropTypes.bool,
	region: PropTypes.string,
	precision: PropTypes.oneOf(['high', 'low']),
};

export default MapViewDirections;
