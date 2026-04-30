//go:build schema

package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/InfluxCommunity/influxdb3-go/v2/influxdb3"
	"github.com/joho/godotenv"
)

// Run with: go run -tags=schema ./schema_example.go
func main() {
	_ = godotenv.Load()
	client, err := influxdb3.New(influxdb3.ClientConfig{
		Host:     os.Getenv("INFLUXDB_HOST"),
		Token:    os.Getenv("INFLUXDB_TOKEN"),
		Database: os.Getenv("INFLUXDB_DATABASE"),
	})
	if err != nil {
		log.Fatal(err)
	}
	defer client.Close()
	ctx := context.Background()

	now := time.Now()
	var points []*influxdb3.Point
	for minute := 0; minute < 60; minute++ {
		ts := now.Add(time.Duration(-(60 - minute)) * time.Minute)
		for _, region := range []string{"us-west", "us-east"} {
			for hostIdx := 0; hostIdx < 3; hostIdx++ {
				p := influxdb3.NewPointWithMeasurement("sensor").
					SetTag("host", fmt.Sprintf("server%02d", hostIdx)).
					SetTag("region", region).
					SetField("temperature", 70.0+float64(minute%5)).
					SetField("humidity", 40.0+float64(hostIdx%3)).
					// gpu_id is HIGH cardinality → field, not tag.
					SetField("gpu_id", fmt.Sprintf("gpu-%s-%d-%d", region, hostIdx, minute)).
					SetTimestamp(ts)
				points = append(points, p)
			}
		}
	}
	fmt.Printf("==> Writing %d points\n", len(points))
	if err := client.WritePoints(ctx, points); err != nil {
		log.Fatal(err)
	}

	fmt.Println("==> Avg temperature per region per 5-min bucket, last hour")
	sql := `
        SELECT region, DATE_BIN(INTERVAL '5 minutes', time) AS bucket, AVG(temperature) AS avg_temp
        FROM sensor
        WHERE time >= now() - INTERVAL '1 hour'
        GROUP BY region, bucket
        ORDER BY bucket DESC, region`
	iter, err := client.Query(ctx, sql)
	if err != nil {
		log.Fatal(err)
	}
	for iter.Next() {
		fmt.Println(iter.Value())
	}
}
