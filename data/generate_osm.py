#!/usr/bin/env python3
"""
Generate Singapore GeoJSON files from known coordinates.
Since we can't reach Overpass API or Geofabrik from this environment,
we build the layers manually using real Singapore geography.
"""

import json
import os
import math
import random

OUTPUT_DIR = "/home/claude/breatheasy-data/osm"

def save_geojson(filename, features):
    """Save features as a GeoJSON FeatureCollection."""
    fc = {
        "type": "FeatureCollection",
        "features": features
    }
    path = os.path.join(OUTPUT_DIR, filename)
    with open(path, "w") as f:
        json.dump(fc, f)
    print(f"  Saved {path}: {len(features)} features")

def line_feature(coords, props=None):
    """Create a GeoJSON LineString feature. Coords are (lng, lat) pairs."""
    return {
        "type": "Feature",
        "geometry": {
            "type": "LineString",
            "coordinates": coords
        },
        "properties": props or {}
    }

def point_feature(lng, lat, props=None):
    return {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [lng, lat]
        },
        "properties": props or {}
    }

def polygon_feature(coords, props=None):
    """Coords are (lng, lat) pairs forming a closed ring."""
    if coords[0] != coords[-1]:
        coords = coords + [coords[0]]
    return {
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [coords]
        },
        "properties": props or {}
    }

def interpolate_line(points, density=20):
    """Interpolate between waypoints to create a denser line."""
    result = []
    for i in range(len(points) - 1):
        lng1, lat1 = points[i]
        lng2, lat2 = points[i + 1]
        for j in range(density):
            t = j / density
            result.append([
                lng1 + t * (lng2 - lng1),
                lat1 + t * (lat2 - lat1)
            ])
    result.append(points[-1])
    return result

def buffer_line_to_polygon(coords, width_deg=0.001):
    """Create a simple polygon buffer around a line (for parks/zones)."""
    left = []
    right = []
    for i in range(len(coords)):
        lng, lat = coords[i]
        if i < len(coords) - 1:
            dlng = coords[i+1][0] - lng
            dlat = coords[i+1][1] - lat
        else:
            dlng = lng - coords[i-1][0]
            dlat = lat - coords[i-1][1]
        length = math.sqrt(dlng**2 + dlat**2)
        if length == 0:
            continue
        nx = -dlat / length * width_deg
        ny = dlng / length * width_deg
        left.append([lng + nx, lat + ny])
        right.append([lng - nx, lat - ny])
    right.reverse()
    ring = left + right + [left[0]]
    return ring


# ============================================================
# 1. EXPRESSWAYS
# ============================================================
print("Generating expressways...")

# PIE (Pan-Island Expressway) — runs east-west across central Singapore
PIE = interpolate_line([
    [103.637, 1.332], [103.660, 1.342], [103.680, 1.352],
    [103.700, 1.358], [103.720, 1.361], [103.740, 1.360],
    [103.760, 1.356], [103.775, 1.350], [103.790, 1.348],
    [103.810, 1.345], [103.830, 1.340], [103.850, 1.338],
    [103.870, 1.336], [103.890, 1.333], [103.910, 1.330],
    [103.930, 1.328], [103.950, 1.335], [103.960, 1.340],
], density=10)

# AYE (Ayer Rajah Expressway) — runs along the south coast
AYE = interpolate_line([
    [103.637, 1.312], [103.660, 1.305], [103.680, 1.298],
    [103.700, 1.292], [103.720, 1.288], [103.740, 1.285],
    [103.760, 1.283], [103.775, 1.282], [103.790, 1.283],
    [103.800, 1.285], [103.810, 1.288], [103.825, 1.290],
    [103.840, 1.291], [103.855, 1.289],
], density=10)

# CTE (Central Expressway) — runs north-south through center
CTE = interpolate_line([
    [103.840, 1.260], [103.839, 1.275], [103.838, 1.290],
    [103.837, 1.305], [103.836, 1.318], [103.835, 1.330],
    [103.834, 1.342], [103.833, 1.355], [103.832, 1.368],
    [103.831, 1.380], [103.830, 1.392], [103.828, 1.405],
], density=10)

# ECP (East Coast Parkway) — along the east coast
ECP = interpolate_line([
    [103.855, 1.289], [103.870, 1.293], [103.885, 1.296],
    [103.900, 1.298], [103.915, 1.300], [103.930, 1.302],
    [103.945, 1.305], [103.960, 1.310], [103.975, 1.315],
], density=10)

# BKE (Bukit Timah Expressway) — northwest to center
BKE = interpolate_line([
    [103.770, 1.430], [103.775, 1.420], [103.778, 1.410],
    [103.780, 1.400], [103.785, 1.390], [103.790, 1.380],
    [103.800, 1.370], [103.810, 1.362], [103.820, 1.355],
    [103.830, 1.350],
], density=10)

# SLE (Seletar Expressway) — runs east-west in the north
SLE = interpolate_line([
    [103.750, 1.398], [103.770, 1.400], [103.790, 1.402],
    [103.810, 1.403], [103.830, 1.402], [103.850, 1.400],
    [103.870, 1.398], [103.890, 1.396], [103.910, 1.394],
], density=10)

# TPE (Tampines Expressway) — northeast
TPE = interpolate_line([
    [103.910, 1.394], [103.920, 1.380], [103.930, 1.370],
    [103.940, 1.360], [103.950, 1.350], [103.955, 1.340],
    [103.960, 1.330],
], density=10)

# KPE (Kallang-Paya Lebar Expressway) — underground/east
KPE = interpolate_line([
    [103.870, 1.310], [103.875, 1.320], [103.880, 1.330],
    [103.885, 1.340], [103.890, 1.350], [103.895, 1.360],
    [103.900, 1.370], [103.905, 1.380],
], density=10)

# MCE (Marina Coastal Expressway) — connects AYE to ECP
MCE = interpolate_line([
    [103.830, 1.265], [103.840, 1.268], [103.850, 1.272],
    [103.858, 1.278], [103.862, 1.285], [103.858, 1.290],
], density=10)

expressway_features = []
for name, coords in [
    ("PIE", PIE), ("AYE", AYE), ("CTE", CTE), ("ECP", ECP),
    ("BKE", BKE), ("SLE", SLE), ("TPE", TPE), ("KPE", KPE), ("MCE", MCE)
]:
    expressway_features.append(line_feature(coords, {
        "name": name,
        "highway": "motorway",
        "ref": name,
        "lanes": "3" if name in ("MCE", "KPE") else "4",
    }))

save_geojson("expressways.geojson", expressway_features)

# ============================================================
# 2. ARTERIAL ROADS (major roads / primary + secondary)
# ============================================================
print("Generating arterials...")

arterials_data = [
    ("Orchard Road", [[103.826, 1.300], [103.832, 1.302], [103.838, 1.304], [103.844, 1.304]]),
    ("Bukit Timah Road", [[103.840, 1.305], [103.835, 1.315], [103.830, 1.325], [103.822, 1.340], [103.815, 1.350], [103.805, 1.362]]),
    ("Upper Thomson Road", [[103.832, 1.350], [103.830, 1.365], [103.828, 1.380], [103.826, 1.395], [103.824, 1.410]]),
    ("Ang Mo Kio Ave 1", [[103.840, 1.365], [103.845, 1.370], [103.850, 1.375], [103.855, 1.380]]),
    ("Tampines Ave", [[103.940, 1.345], [103.945, 1.350], [103.950, 1.355], [103.955, 1.348]]),
    ("Jurong Town Hall Road", [[103.740, 1.330], [103.745, 1.335], [103.748, 1.340]]),
    ("Clementi Road", [[103.760, 1.320], [103.770, 1.318], [103.780, 1.315]]),
    ("Nicoll Highway", [[103.860, 1.298], [103.868, 1.300], [103.875, 1.303]]),
    ("Victoria Street", [[103.852, 1.296], [103.856, 1.298], [103.860, 1.300]]),
    ("Serangoon Road", [[103.853, 1.305], [103.858, 1.315], [103.862, 1.325], [103.865, 1.335]]),
    ("Geylang Road", [[103.870, 1.313], [103.878, 1.315], [103.886, 1.318], [103.894, 1.320]]),
    ("Toa Payoh Lorong", [[103.845, 1.332], [103.850, 1.338], [103.855, 1.342]]),
    ("Woodlands Ave", [[103.785, 1.430], [103.790, 1.435], [103.795, 1.438]]),
    ("Yishun Ave", [[103.830, 1.420], [103.835, 1.425], [103.840, 1.428]]),
    ("Pasir Ris Drive", [[103.950, 1.370], [103.955, 1.373], [103.960, 1.375]]),
    ("Bedok North Road", [[103.925, 1.332], [103.930, 1.335], [103.935, 1.338]]),
    ("Commonwealth Ave", [[103.790, 1.302], [103.800, 1.300], [103.810, 1.298]]),
    ("Alexandra Road", [[103.800, 1.288], [103.808, 1.286], [103.815, 1.284]]),
    ("Holland Road", [[103.790, 1.310], [103.795, 1.315], [103.800, 1.320]]),
    ("Adam Road", [[103.815, 1.328], [103.820, 1.332], [103.825, 1.335]]),
    ("Dunearn Road", [[103.800, 1.325], [103.808, 1.328], [103.815, 1.330]]),
    ("Lornie Road", [[103.825, 1.335], [103.828, 1.340], [103.830, 1.345]]),
    ("Sims Avenue", [[103.875, 1.315], [103.885, 1.318], [103.895, 1.320], [103.905, 1.322]]),
    ("Changi Road", [[103.895, 1.320], [103.910, 1.324], [103.925, 1.328]]),
    ("Upper East Coast Road", [[103.920, 1.310], [103.935, 1.312], [103.950, 1.315]]),
    ("Hougang Ave", [[103.880, 1.360], [103.885, 1.365], [103.890, 1.368]]),
    ("Punggol Road", [[103.900, 1.390], [103.908, 1.395], [103.915, 1.398]]),
    ("West Coast Highway", [[103.720, 1.280], [103.735, 1.278], [103.750, 1.276]]),
    ("Pioneer Road", [[103.695, 1.320], [103.702, 1.318], [103.710, 1.315]]),
    ("Mandai Road", [[103.780, 1.395], [103.785, 1.400], [103.790, 1.408]]),
]

arterial_features = []
for name, waypoints in arterials_data:
    coords = interpolate_line([[p[0], p[1]] for p in waypoints], density=8)
    arterial_features.append(line_feature(coords, {
        "name": name,
        "highway": "primary",
    }))

save_geojson("arterials.geojson", arterial_features)

# ============================================================
# 3. TRAFFIC SIGNALS (major junctions)
# ============================================================
print("Generating traffic signals...")

# Major junction locations
junctions = [
    (103.845, 1.304, "Orchard/Scotts"),
    (103.838, 1.302, "Orchard/Tanglin"),
    (103.851, 1.300, "Orchard/Bras Basah"),
    (103.836, 1.330, "PIE/BKE"),
    (103.836, 1.345, "Lornie/Adam"),
    (103.860, 1.310, "Nicoll/Kallang"),
    (103.870, 1.313, "Geylang/Sims"),
    (103.852, 1.338, "Toa Payoh/CTE"),
    (103.840, 1.365, "AMK Ave/CTE"),
    (103.830, 1.392, "SLE/CTE"),
    (103.790, 1.348, "PIE/BKE North"),
    (103.910, 1.330, "PIE/Tampines"),
    (103.895, 1.355, "Hougang/Serangoon"),
    (103.745, 1.335, "PIE/Jurong"),
    (103.770, 1.318, "Clementi/AYE"),
    (103.800, 1.300, "Commonwealth/AYE"),
    (103.855, 1.289, "AYE/ECP"),
    (103.940, 1.345, "Tampines Hub"),
    (103.900, 1.370, "TPE/KPE"),
    (103.785, 1.430, "Woodlands Centre"),
    (103.830, 1.420, "Yishun Central"),
    (103.950, 1.370, "Pasir Ris Central"),
    (103.820, 1.355, "Upper Thomson/PIE"),
    (103.808, 1.328, "Dunearn/Adam"),
    (103.880, 1.340, "Serangoon/Hougang"),
    (103.920, 1.310, "ECP/Bedok"),
    (103.710, 1.315, "Pioneer/AYE"),
    (103.862, 1.325, "Serangoon Mid"),
    (103.905, 1.322, "Sims/Changi"),
]

# Add more junctions along major roads (every ~500m along expressways)
extra_junctions = []
for name, coords in [("PIE", PIE), ("AYE", AYE), ("CTE", CTE)]:
    for i in range(0, len(coords), 15):
        extra_junctions.append((coords[i][0], coords[i][1], f"{name} Junction"))

signal_features = []
for lng, lat, name in junctions + extra_junctions:
    signal_features.append(point_feature(lng, lat, {
        "highway": "traffic_signals",
        "name": name,
    }))

save_geojson("traffic_signals.geojson", signal_features)

# ============================================================
# 4. PARKS AND GREEN SPACES
# ============================================================
print("Generating parks...")

parks_data = [
    ("East Coast Park", [
        [103.870, 1.298], [103.880, 1.296], [103.900, 1.296],
        [103.920, 1.298], [103.940, 1.300], [103.950, 1.302],
        [103.950, 1.306], [103.940, 1.305], [103.920, 1.303],
        [103.900, 1.301], [103.880, 1.300], [103.870, 1.302],
    ]),
    ("MacRitchie Reservoir", [
        [103.822, 1.340], [103.830, 1.338], [103.838, 1.340],
        [103.840, 1.348], [103.838, 1.355], [103.830, 1.358],
        [103.822, 1.355], [103.820, 1.348],
    ]),
    ("Botanic Gardens", [
        [103.813, 1.312], [103.818, 1.311], [103.821, 1.314],
        [103.820, 1.320], [103.816, 1.322], [103.812, 1.318],
    ]),
    ("Gardens by the Bay", [
        [103.860, 1.278], [103.870, 1.277], [103.873, 1.282],
        [103.870, 1.287], [103.862, 1.288], [103.858, 1.284],
    ]),
    ("Bishan-Ang Mo Kio Park", [
        [103.840, 1.357], [103.848, 1.356], [103.850, 1.362],
        [103.847, 1.368], [103.840, 1.370], [103.837, 1.364],
    ]),
    ("Bedok Reservoir Park", [
        [103.925, 1.337], [103.932, 1.336], [103.936, 1.340],
        [103.934, 1.345], [103.928, 1.346], [103.924, 1.342],
    ]),
    ("Pasir Ris Park", [
        [103.945, 1.378], [103.955, 1.377], [103.960, 1.380],
        [103.958, 1.386], [103.950, 1.387], [103.944, 1.383],
    ]),
    ("West Coast Park", [
        [103.758, 1.278], [103.768, 1.276], [103.772, 1.280],
        [103.770, 1.284], [103.762, 1.285], [103.757, 1.282],
    ]),
    ("Bukit Timah Nature Reserve", [
        [103.772, 1.350], [103.782, 1.348], [103.788, 1.355],
        [103.786, 1.365], [103.778, 1.368], [103.770, 1.362],
    ]),
    ("Central Catchment Nature Reserve", [
        [103.800, 1.355], [103.815, 1.352], [103.825, 1.358],
        [103.828, 1.372], [103.820, 1.382], [103.808, 1.385],
        [103.798, 1.378], [103.795, 1.368],
    ]),
    ("Sungei Buloh Wetland Reserve", [
        [103.725, 1.440], [103.740, 1.438], [103.745, 1.445],
        [103.738, 1.450], [103.728, 1.448],
    ]),
    ("Punggol Waterway Park", [
        [103.900, 1.404], [103.910, 1.402], [103.915, 1.408],
        [103.910, 1.412], [103.902, 1.410],
    ]),
    ("Kallang Riverside Park", [
        [103.862, 1.305], [103.870, 1.303], [103.875, 1.308],
        [103.872, 1.312], [103.865, 1.310],
    ]),
    ("Fort Canning Park", [
        [103.845, 1.293], [103.850, 1.292], [103.852, 1.296],
        [103.849, 1.298], [103.844, 1.297],
    ]),
    ("Kent Ridge Park", [
        [103.788, 1.282], [103.796, 1.280], [103.800, 1.284],
        [103.796, 1.289], [103.790, 1.288],
    ]),
    ("Southern Ridges", [
        [103.798, 1.275], [103.808, 1.272], [103.818, 1.274],
        [103.820, 1.279], [103.815, 1.283], [103.805, 1.282],
        [103.798, 1.280],
    ]),
    ("Lower Peirce Reservoir", [
        [103.820, 1.370], [103.828, 1.368], [103.832, 1.374],
        [103.828, 1.380], [103.820, 1.378],
    ]),
    ("Coney Island", [
        [103.920, 1.406], [103.932, 1.404], [103.940, 1.407],
        [103.938, 1.412], [103.928, 1.413], [103.920, 1.410],
    ]),
]

park_features = []
for name, ring in parks_data:
    park_features.append(polygon_feature(ring, {
        "name": name,
        "leisure": "park",
    }))

save_geojson("parks.geojson", park_features)

# ============================================================
# 5. INDUSTRIAL ZONES
# ============================================================
print("Generating industrial zones...")

industrial_data = [
    ("Jurong Industrial Estate", [
        [103.690, 1.310], [103.720, 1.308], [103.725, 1.320],
        [103.720, 1.335], [103.705, 1.338], [103.690, 1.330],
    ]),
    ("Tuas Industrial", [
        [103.620, 1.310], [103.650, 1.308], [103.655, 1.320],
        [103.650, 1.335], [103.630, 1.338], [103.618, 1.325],
    ]),
    ("Woodlands Industrial", [
        [103.770, 1.432], [103.785, 1.430], [103.790, 1.438],
        [103.785, 1.445], [103.772, 1.442],
    ]),
    ("Changi Business Park", [
        [103.960, 1.330], [103.975, 1.328], [103.980, 1.338],
        [103.972, 1.342], [103.960, 1.340],
    ]),
    ("Paya Lebar Industrial", [
        [103.885, 1.340], [103.895, 1.338], [103.900, 1.345],
        [103.895, 1.350], [103.885, 1.348],
    ]),
    ("Kallang/Kolam Ayer Industrial", [
        [103.868, 1.318], [103.878, 1.316], [103.882, 1.324],
        [103.876, 1.328], [103.868, 1.326],
    ]),
    ("Senoko Industrial", [
        [103.795, 1.445], [103.810, 1.443], [103.815, 1.450],
        [103.808, 1.455], [103.795, 1.452],
    ]),
    ("Tanjong Kling Industrial", [
        [103.728, 1.278], [103.740, 1.276], [103.745, 1.282],
        [103.738, 1.286], [103.728, 1.284],
    ]),
]

industrial_features = []
for name, ring in industrial_data:
    industrial_features.append(polygon_feature(ring, {
        "name": name,
        "landuse": "industrial",
    }))

save_geojson("industrial.geojson", industrial_features)

# ============================================================
# 6. BUILDINGS (simplified — dense clusters near major roads)
# ============================================================
print("Generating buildings (simplified clusters)...")

# We don't need individual buildings — just dense zones near roads
# for the street canyon calculation. Generate rectangles along arterials.
building_features = []

# CBD area — dense buildings
cbd_centers = [
    (103.850, 1.285), (103.852, 1.287), (103.854, 1.289),
    (103.848, 1.283), (103.846, 1.281), (103.856, 1.291),
    (103.853, 1.293), (103.849, 1.295), (103.851, 1.297),
    (103.847, 1.299), (103.843, 1.297), (103.845, 1.301),
]

# Toa Payoh, Ang Mo Kio, Bedok HDB areas
hdb_centers = [
    # Toa Payoh
    (103.845, 1.332), (103.847, 1.334), (103.849, 1.336),
    (103.843, 1.335), (103.846, 1.338),
    # Ang Mo Kio
    (103.842, 1.368), (103.845, 1.370), (103.848, 1.372),
    (103.840, 1.372), (103.843, 1.374),
    # Bedok
    (103.925, 1.325), (103.928, 1.327), (103.930, 1.330),
    (103.923, 1.328), (103.926, 1.332),
    # Tampines
    (103.942, 1.350), (103.945, 1.352), (103.948, 1.354),
    # Jurong East
    (103.742, 1.332), (103.745, 1.334), (103.748, 1.336),
    # Woodlands
    (103.785, 1.435), (103.788, 1.437), (103.790, 1.433),
    # Yishun
    (103.832, 1.422), (103.835, 1.424), (103.837, 1.426),
    # Punggol
    (103.905, 1.398), (103.908, 1.400), (103.910, 1.396),
    # Bukit Merah
    (103.820, 1.282), (103.822, 1.284), (103.818, 1.286),
    # Queenstown
    (103.798, 1.294), (103.800, 1.296), (103.796, 1.298),
]

for lng, lat in cbd_centers + hdb_centers:
    # Create small building footprint (~30m x 30m)
    size = 0.0003
    ring = [
        [lng - size, lat - size],
        [lng + size, lat - size],
        [lng + size, lat + size],
        [lng - size, lat + size],
    ]
    building_features.append(polygon_feature(ring, {"building": "yes"}))

save_geojson("buildings.geojson", building_features)

# ============================================================
# 7. CYCLEWAYS / PARK CONNECTORS
# ============================================================
print("Generating cycleways...")

pcn_data = [
    ("Eastern Coastal PCN", [
        [103.870, 1.300], [103.890, 1.302], [103.910, 1.304],
        [103.930, 1.306], [103.950, 1.310], [103.960, 1.318],
    ]),
    ("Kallang PCN", [
        [103.860, 1.308], [103.855, 1.318], [103.850, 1.328],
        [103.845, 1.340], [103.842, 1.350],
    ]),
    ("Ulu Pandan PCN", [
        [103.780, 1.310], [103.785, 1.315], [103.790, 1.320],
        [103.795, 1.328], [103.800, 1.335],
    ]),
    ("Punggol PCN", [
        [103.895, 1.398], [103.905, 1.402], [103.915, 1.406],
        [103.925, 1.408], [103.935, 1.406],
    ]),
    ("Northern Explorer PCN", [
        [103.775, 1.435], [103.790, 1.438], [103.805, 1.440],
        [103.820, 1.438], [103.835, 1.435],
    ]),
]

cycleway_features = []
for name, waypoints in pcn_data:
    coords = interpolate_line(waypoints, density=8)
    cycleway_features.append(line_feature(coords, {
        "name": name,
        "highway": "cycleway",
    }))

save_geojson("cycleways.geojson", cycleway_features)

print("\n✅ All GeoJSON files generated!")
print(f"   Output directory: {OUTPUT_DIR}")
